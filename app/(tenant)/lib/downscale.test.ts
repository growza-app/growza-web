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
