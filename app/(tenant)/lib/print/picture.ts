import { fitInside, logoMaxHeight, toBitmap, type Bitmap } from './bitmap';
import { dotsPerLine, type PaperWidth } from './ticket';

/**
 * Jira GRW-728 — the business's logo as the dots a 58mm or 80mm roll prints.
 *
 * The one part that needs a browser: decoding the picture and reading its pixels off a canvas. `src` is a data URI
 * (the API sends the picture itself — a canvas that drew one from the S3 bucket's address could not be read back).
 * Anything that goes wrong is null and the bill prints without it: a logo never stops a bill (GRW-713 BR-03).
 */
export async function logoBitmap(src: string, width: PaperWidth): Promise<Bitmap | null> {
  if (typeof document === 'undefined') return null;
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const dots = dotsPerLine(width);
    const box = fitInside(img.naturalWidth, img.naturalHeight, dots, logoMaxHeight(dots));
    if (box.width === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = box.width;
    canvas.height = box.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, box.width, box.height);
    const { data } = ctx.getImageData(0, 0, box.width, box.height);
    return toBitmap(data, box.width, box.height, dots, 'dither');
  } catch {
    return null;
  }
}
