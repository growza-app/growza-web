import { describe, expect, it } from 'vitest';
import { LOGO_MAX_BYTES, logoKind, megabytes, prepareLogo } from './logo-file';

/** Jira GRW-728 — which pictures the logo takes, and the refusal that names the size (Validations). */
const file = (name: string, type: string, bytes: number) => new File([new Uint8Array(bytes)], name, { type });
const keep = async (f: File) => f;

describe('the logo file (Validations, AC-02)', () => {
  it('takes PNG, JPG and SVG — and WebP, which this screen always took', () => {
    expect(logoKind('image/png', 'a.png')).toBe('png');
    expect(logoKind('image/jpeg', 'a.jpg')).toBe('jpg');
    expect(logoKind('image/svg+xml', 'a.svg')).toBe('svg');
    expect(logoKind('image/webp', 'a.webp')).toBe('webp');
  });

  it('refuses a PDF, a GIF and a HEIC; with no type, goes by the name', () => {
    expect(logoKind('application/pdf', 'menu.pdf')).toBeNull();
    expect(logoKind('image/gif', 'a.gif')).toBeNull();
    expect(logoKind('image/heic', 'IMG_1.heic')).toBeNull();
    expect(logoKind('', 'logo.SVG')).toBe('svg');
    expect(logoKind('', 'menu.pdf')).toBeNull();
  });

  it('a PDF is refused before anything is uploaded', async () => {
    expect(await prepareLogo(file('menu.pdf', 'application/pdf', 1000), keep)).toEqual({ ok: false, reason: 'type' });
  });

  it('2 MB after shrinking goes through; a byte over is refused with its size', async () => {
    expect(await prepareLogo(file('a.png', 'image/png', LOGO_MAX_BYTES), keep)).toMatchObject({ ok: true });
    expect(await prepareLogo(file('a.png', 'image/png', LOGO_MAX_BYTES + 1), keep)).toEqual({ ok: false, reason: 'size', size: '2.1 MB' });
  });

  it('measures what is left after shrinking, not what was picked', async () => {
    const shrunk = await prepareLogo(file('big.jpg', 'image/jpeg', 6 * 1024 * 1024), async () => file('big.webp', 'image/webp', 90_000));
    expect(shrunk).toMatchObject({ ok: true });
  });

  it('names the size with one decimal, rounding up', () => {
    expect(megabytes(2.4 * 1024 * 1024)).toBe('2.4 MB');
    expect(megabytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
