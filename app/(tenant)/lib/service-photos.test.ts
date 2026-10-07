import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasServicePhoto, packPhotoUrl, servicePhotoUrl } from './service-photos';

/**
 * Jira GRW-560 — the supplied pack, and the two ways it goes wrong quietly.
 *
 * A key the API sends that has no file here draws a broken image on every row of
 * a price list; a file here that no key points at is weight nobody ever sees. The
 * API's own `catalog-keys.test.ts` guards the other end — that a vertical names
 * only concepts the matcher knows.
 */
const packDir = resolve(__dirname, '../../../public/catalog');
const onDisk = readdirSync(packDir).filter((f) => f.endsWith('.webp'));

const svc = (over: Partial<Parameters<typeof servicePhotoUrl>[0]> = {}) =>
  ({ imageUrl: null, categoryName: null, catalogKey: null, ...over }) as Parameters<typeof servicePhotoUrl>[0];

describe('the pack on disk', () => {
  it('has a file for every key the code will build a URL for', () => {
    const missing = onDisk.length === 0 ? ['the pack directory is empty'] : [];
    expect(missing).toEqual([]);
    for (const file of onDisk) {
      const key = file.replace(/\.webp$/, '');
      expect(packPhotoUrl(key), `${key} is on disk but the code will not serve it`).toBe(`/catalog/${key}.webp`);
    }
  });

  /**
   * BR-01 — a screen never loads more than about 200 KB of images, and the list draws
   * ten rows. A photo that drifts past ~25 KB breaks that quietly, one file at a time.
   */
  it('keeps every photo inside the weight budget', () => {
    const heavy = onDisk
      .map((f) => ({ f, kb: Math.round(statSync(resolve(packDir, f)).size / 1024) }))
      .filter((x) => x.kb > 25);
    expect(heavy).toEqual([]);
  });

  it('a whole page of pack photos stays under the budget', () => {
    const total = onDisk.reduce((sum, f) => sum + statSync(resolve(packDir, f)).size, 0);
    const perPage = (total / onDisk.length) * 10;
    expect(Math.round(perPage / 1024)).toBeLessThan(200);
  });
});

describe('which picture a service gets', () => {
  it("prefers the owner's own upload over everything", () => {
    expect(servicePhotoUrl(svc({ imageUrl: '/uploads/t/services/x.webp', catalogKey: 'haircut', categoryName: 'Hair' }))).toBe(
      '/uploads/t/services/x.webp',
    );
  });

  it('falls back to the pack for the concept the API matched', () => {
    expect(servicePhotoUrl(svc({ catalogKey: 'haircut', categoryName: 'Hair' }))).toBe('/catalog/haircut.webp');
  });

  /** The API is deployed first and may know concepts whose photograph is not made yet. */
  it('falls through to the placeholder for a concept with no photograph', () => {
    expect(packPhotoUrl('saree-draping')).toBeNull();
    expect(servicePhotoUrl(svc({ catalogKey: 'saree-draping', categoryName: 'Hair' }))).toBe('/service-photos/hair.jpg');
  });

  it('never builds a path out of something the pack does not list', () => {
    for (const nasty of ['../../etc/passwd', 'haircut/../../secret', '', 'HAIRCUT', null, undefined]) {
      expect(packPhotoUrl(nasty as string | null)).toBeNull();
    }
  });

  /**
   * The list draws an empty tile rather than a stock photo: thirty rows of somebody
   * else's salon reads worse than thirty blanks.
   */
  it('knows the difference between a real picture and a placeholder', () => {
    expect(hasServicePhoto(svc({ catalogKey: 'haircut' }))).toBe(true);
    expect(hasServicePhoto(svc({ imageUrl: '/uploads/t/services/x.webp' }))).toBe(true);
    expect(hasServicePhoto(svc({ categoryName: 'Hair' }))).toBe(false);
    expect(hasServicePhoto(svc({ catalogKey: 'saree-draping' }))).toBe(false);
  });
});
