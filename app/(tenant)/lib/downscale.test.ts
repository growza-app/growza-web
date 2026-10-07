import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { downscaleImage, MAX_UPLOAD_EDGE } from './downscale';

/**
 * Jira GRW-558 — the upload is made small before it leaves the phone.
 *
 * The server resizes too, so this is not what makes the STORED file small. It
 * is what the owner feels: a 4 MB camera-roll photo on a salon's connection is
 * a progress bar, and the same picture leaves at around 120 KB once it has been
 * through here.
 *
 * Most of what follows is the fail-open behaviour, because that is the part
 * that can hurt: this is an optimisation in front of the server's cap and
 * byte-sniff, and it must never be the reason an upload is refused.
 */

const file = (name: string, type: string, bytes: number) =>
  new File([new Uint8Array(bytes)], name, { type });

/**
 * A canvas whose `toBlob` yields a blob of a size this test chooses.
 *
 * Injected rather than mocked onto `document`: this repo's vitest runs in node
 * with no DOM, and adding jsdom to exercise four lines of canvas would be a
 * dependency bought to make a test possible rather than the product work.
 */
const stubCanvas = (produced: { type: string; size: number } | null) => {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (cb: (b: Blob | null) => void, type: string) => {
      cb(produced === null ? null : ({ type: produced.type || type, size: produced.size } as Blob));
    },
  };
  return { canvas, createCanvas: () => canvas as unknown as HTMLCanvasElement };
};

const bitmap = (width: number, height: number) =>
  vi.fn(async () => ({ width, height, close: vi.fn() })) as unknown as typeof createImageBitmap;

describe('what it leaves alone', () => {
  it('a small picture the server already accepts', async () => {
    const small = file('logo.png', 'image/png', 50_000);
    const createBitmap = bitmap(400, 400);
    expect(await downscaleImage(small, { createBitmap })).toBe(small);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it('a picture already inside the cap, rather than re-encoding and losing detail', async () => {
    const already = file('photo.jpg', 'image/jpeg', 900_000);
    expect(await downscaleImage(already, { createBitmap: bitmap(1200, 800) })).toBe(already);
  });

  it('everything, on a browser with no createImageBitmap', async () => {
    const big = file('photo.jpg', 'image/jpeg', 4_000_000);
    expect(await downscaleImage(big, { createBitmap: undefined })).toBe(big);
  });
});

describe('what it shrinks', () => {
  it('a camera-roll photo, to the long edge and to WebP', async () => {
    const { canvas, createCanvas } = stubCanvas({ type: 'image/webp', size: 120_000 });
    const big = file('IMG_4821.HEIC.jpg', 'image/jpeg', 4_000_000);

    const out = await downscaleImage(big, { createBitmap: bitmap(4032, 3024), createCanvas });

    expect(out).not.toBe(big);
    expect(out.type).toBe('image/webp');
    expect(out.size).toBeLessThan(big.size);
    expect(canvas.width).toBe(MAX_UPLOAD_EDGE);
    expect(canvas.height).toBe(Math.round((MAX_UPLOAD_EDGE * 3024) / 4032));
    // The owner's own filename survives, with an extension that matches what is inside.
    expect(out.name).toBe('IMG_4821.HEIC.webp');
  });

  /** An iPhone's HEIC is a type the API refuses; converting it is the difference between working and not. */
  it('a small HEIC, even though it is small, because the server would refuse it as it is', async () => {
    const { createCanvas } = stubCanvas({ type: 'image/webp', size: 60_000 });
    const heic = file('IMG_0001.HEIC', 'image/heic', 80_000);

    const out = await downscaleImage(heic, { createBitmap: bitmap(900, 1200), createCanvas });

    expect(out.type).toBe('image/webp');
    expect(out.name).toBe('IMG_0001.webp');
  });
});

describe('what it does when something goes wrong — always, send the original', () => {
  it('the image will not decode here', async () => {
    const odd = file('photo.jpg', 'image/jpeg', 3_000_000);
    const createBitmap = vi.fn(async () => {
      throw new Error('unsupported codec');
    }) as unknown as typeof createImageBitmap;
    expect(await downscaleImage(odd, { createBitmap })).toBe(odd);
  });

  it('the canvas produces nothing', async () => {
    const { createCanvas } = stubCanvas(null);
    const big = file('photo.jpg', 'image/jpeg', 3_000_000);
    expect(await downscaleImage(big, { createBitmap: bitmap(3000, 2000), createCanvas })).toBe(big);
  });

  it('the browser cannot encode WebP and falls back to something the server refuses', async () => {
    const { createCanvas } = stubCanvas({ type: 'image/gif', size: 10_000 });
    const big = file('photo.jpg', 'image/jpeg', 3_000_000);
    expect(await downscaleImage(big, { createBitmap: bitmap(3000, 2000), createCanvas })).toBe(big);
  });

  /** A detailed image can come out of a re-encode LARGER; sending that would be the opposite of the point. */
  it('the re-encode did not actually help', async () => {
    const { createCanvas } = stubCanvas({ type: 'image/webp', size: 3_500_000 });
    const big = file('photo.jpg', 'image/jpeg', 3_000_000);
    expect(await downscaleImage(big, { createBitmap: bitmap(3000, 2000), createCanvas })).toBe(big);
  });
});

/**
 * Jira GRW-558 — QA, 2026-10-07. Two findings about the call sites rather than the function.
 *
 * These read source, as `settings-review.test.ts` and `NewVisitSheet`'s tests do: they are client
 * components and this repo's vitest runs in node with no DOM, and adding jsdom to assert four
 * lines would be a dependency bought to make a test possible rather than the product work.
 */
describe('who gets downscaled, and what nobody refuses first', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

  /** `uploadFile` also carries the service-sheet import; a CSV was being handed to `createImageBitmap`. */
  it('only a picture goes through the downscaler', () => {
    const api = read('./api.ts');
    expect(api).toMatch(/const isPicture = file\.type === '' \|\| file\.type\.startsWith\('image\/'\);/);
    expect(api).toMatch(/form\.append\(field, isPicture \? await downscaleImage\(file\) : file\);/);
  });

  /**
   * The screens used to refuse anything over 5 MB before the downscaler ran — which is the photo a
   * phone actually takes. The API's cap is the only one now, and it answers with a sentence.
   */
  it('no screen refuses a photo on size before it has been downscaled', () => {
    for (const p of ['../services/ServicesTable.tsx', '../services/ServiceForm.tsx', '../settings/profile/ProfileForm.tsx']) {
      const src = read(p);
      expect(src, p).not.toMatch(/MAX_PHOTO_BYTES/);
      expect(src, p).not.toMatch(/5 \* 1024 \* 1024/);
      expect(src, p).not.toMatch(/photoTooBig/);
    }
  });

  it('and the copy for that refusal is gone from both languages', () => {
    for (const lang of ['en', 'hi']) {
      expect(read(`../../../messages/${lang}.json`), lang).not.toMatch(/photoTooBig/);
    }
  });
});
