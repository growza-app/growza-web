/**
 * Jira GRW-728 — a picture as a thermal printer prints it: black dots and white paper, nothing between.
 *
 * A thermal head burns a dot or it does not, so a logo has to be turned into one bit a dot before it reaches the
 * paper — and the owner should see THAT, not the colour picture, before a bill comes out looking like a smudge.
 * Everything here is pure (pixels in, bits out), so it is tested in Node with no canvas: the browser only decodes the
 * picture and hands over its pixels (`picture.ts`).
 */

export interface Bitmap {
  /** Width in dots, a multiple of 8. */
  width: number;
  height: number;
  /** One bit per dot, rows top to bottom, most significant bit leftmost; 1 = black. */
  bits: Uint8Array;
}

/** The tallest a logo may print: 30% of the roll's width (story FR-02), so it heads the bill and does not become it. */
export function logoMaxHeight(widthDots: number): number {
  return Math.floor(widthDots * 0.3);
}

/**
 * The size a picture is drawn at: as large as fits inside `maxW` × `maxH`, its shape kept. A small picture is made
 * larger to fill the box — the stored logo is 384px on its long edge, and an 80mm roll is 576 dots wide.
 */
export function fitInside(naturalW: number, naturalH: number, maxW: number, maxH: number): { width: number; height: number } {
  if (!(naturalW > 0) || !(naturalH > 0)) return { width: 0, height: 0 };
  const scale = Math.min(maxW / naturalW, maxH / naturalH);
  return { width: Math.max(1, Math.min(maxW, Math.round(naturalW * scale))), height: Math.max(1, Math.min(maxH, Math.round(naturalH * scale))) };
}

/**
 * RGBA pixels as a full-roll-width bitmap, the picture centred on it.
 *
 * The full width, rather than the picture's own: `GS v 0` is a raster the printer lays down from its left margin, and
 * not every cheap printer honours centring for one — a picture as wide as the paper is centred on all of them.
 *
 * `dither` (a logo): Floyd–Steinberg error diffusion, which is how a grey or a colour survives as a pattern of dots —
 * a red logo prints as a dense grey instead of vanishing below a threshold. `threshold` (a QR someone photographed,
 * Jira GRW-729): every dot is black or white by its own brightness, because a QR's squares must stay squares and
 * diffusion would scatter dots into the white between them. A see-through pixel is paper.
 */
export function toBitmap(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  widthDots: number,
  mode: 'dither' | 'threshold' = 'dither',
): Bitmap {
  const width = Math.ceil(widthDots / 8) * 8;
  const bits = new Uint8Array((width / 8) * h);
  const left = Math.max(0, Math.floor((width - w) / 2));
  // Brightness 0 (black) … 255 (white), composited on white paper.
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const a = rgba[i * 4 + 3]! / 255;
    const y = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
    lum[i] = y * a + 255 * (1 - a);
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const old = lum[i]!;
      const black = old < 128;
      if (mode === 'dither') {
        const err = old - (black ? 0 : 255);
        if (x + 1 < w) lum[i + 1]! += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) lum[i + w - 1]! += (err * 3) / 16;
          lum[i + w]! += (err * 5) / 16;
          if (x + 1 < w) lum[i + w + 1]! += err / 16;
        }
      }
      const dx = left + x;
      if (black && dx < width) bits[y * (width / 8) + (dx >> 3)]! |= 0x80 >> (dx & 7);
    }
  }
  return { width, height: h, bits };
}

/** Is the dot at (x, y) black? */
export function dotAt(bmp: Bitmap, x: number, y: number): boolean {
  return ((bmp.bits[y * (bmp.width / 8) + (x >> 3)]! >> (7 - (x & 7))) & 1) === 1;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

/**
 * The bitmap as a 1-bit BMP data URL — the same dots the Bluetooth printer is sent, for the print dialog and for the
 * preview on Settings. A BMP because a 1-bit BMP is a header and the rows, written here in a few lines with no canvas;
 * every browser draws one.
 */
export function bitmapDataUrl(bmp: Bitmap): string {
  const rowBytes = Math.ceil(bmp.width / 32) * 4;
  const offset = 14 + 40 + 8;
  const size = offset + rowBytes * bmp.height;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out[0] = 0x42; // B
  out[1] = 0x4d; // M
  view.setUint32(2, size, true);
  view.setUint32(10, offset, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, bmp.width, true);
  view.setInt32(22, bmp.height, true); // positive: rows bottom-up
  view.setUint16(26, 1, true);
  view.setUint16(28, 1, true); // one bit a pixel
  view.setUint32(34, rowBytes * bmp.height, true);
  view.setInt32(38, 8000, true); // 203 dpi, give or take
  view.setInt32(42, 8000, true);
  view.setUint32(46, 2, true);
  // Palette: 0 is paper (white), 1 is a dot (black) — the same meaning a bit has in `bits`.
  out.set([0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00], 54);
  const src = bmp.width / 8;
  for (let y = 0; y < bmp.height; y += 1) {
    const row = offset + (bmp.height - 1 - y) * rowBytes;
    out.set(bmp.bits.subarray(y * src, y * src + src), row);
  }
  return `data:image/bmp;base64,${base64(out)}`;
}
