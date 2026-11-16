import type { Bitmap, Rasterize } from './escpos';
import { charsPerLine, itemColumns } from './ticket';

/**
 * Jira GRW-713 — a line the printer's own font cannot say (Hindi, mostly), drawn by the browser into the bitmap
 * `escpos.ts` sends as `GS v 0`.
 *
 * It draws with the page's own font stack, so a Devanagari dish name comes out in the same Noto Sans Devanagari the
 * screen shows it in. 24px is the printer's font A height, so a drawn line sits the same size as a printed one.
 */
const BASE_PX = 24;
const LINE_GAP = 4;

function measureWrap(ctx: CanvasRenderingContext2D, text: string, room: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (!line || ctx.measureText(next).width <= room) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

function toBits(ctx: CanvasRenderingContext2D, width: number, height: number): Uint8Array {
  const { data } = ctx.getImageData(0, 0, width, height);
  const bits = new Uint8Array((width / 8) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      // Dark enough on white is black; anti-aliased edges below the middle grey are dropped.
      const luma = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      if (data[i + 3]! > 127 && luma < 128) bits[y * (width / 8) + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }
  return bits;
}

export function canvasRasterizer(fontFamily: string): Rasterize {
  return (line, widthDots): Bitmap => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d canvas');
    const size = line.kind === 'text' ? (line.size ?? 1) : 1;
    const px = BASE_PX * size;
    const bold = line.kind === 'item' ? line.header : line.bold;
    const font = `${bold ? 700 : 400} ${px}px ${fontFamily}`;
    ctx.font = font;

    const rows: { text: string; x: number; align: CanvasTextAlign }[][] = [];
    if (line.kind === 'text') {
      const align = line.align ?? 'left';
      const x = align === 'center' ? widthDots / 2 : align === 'right' ? widthDots : 0;
      for (const t of measureWrap(ctx, line.text, widthDots)) rows.push([{ text: t, x, align }]);
    } else if (line.kind === 'item') {
      // The same columns the text rows use, in dots: 12 dots a character on either roll.
      const width = widthDots === 384 ? '58' : '80';
      const dot = widthDots / charsPerLine(width);
      const c = itemColumns(width);
      const qtyEnd = (c.name + 1 + c.qty) * dot;
      const priceEnd = qtyEnd + (c.price ? (1 + c.price) * dot : 0);
      measureWrap(ctx, line.name, c.name * dot).forEach((t, i) =>
        rows.push(
          i === 0
            ? [
                { text: t, x: 0, align: 'left' },
                { text: line.qty, x: qtyEnd, align: 'right' },
                ...(c.price ? [{ text: line.price, x: priceEnd, align: 'right' as CanvasTextAlign }] : []),
                { text: line.amount, x: widthDots, align: 'right' },
              ]
            : [{ text: t, x: 0, align: 'left' }],
        ),
      );
    } else {
      const rightW = ctx.measureText(line.right).width;
      const lefts = measureWrap(ctx, line.left, Math.max(widthDots / 2, widthDots - rightW - 12));
      lefts.forEach((t, i) => rows.push(i === 0 ? [{ text: t, x: 0, align: 'left' }, { text: line.right, x: widthDots, align: 'right' }] : [{ text: t, x: 0, align: 'left' }]));
    }

    const height = rows.length * (px + LINE_GAP);
    canvas.width = widthDots;
    canvas.height = height;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, widthDots, height);
    ctx.fillStyle = '#000';
    ctx.font = font; // resizing a canvas resets its state
    ctx.textBaseline = 'top';
    rows.forEach((row, r) => {
      for (const part of row) {
        ctx.textAlign = part.align;
        ctx.fillText(part.text, part.x, r * (px + LINE_GAP));
      }
    });
    return { width: widthDots, height, bits: toBits(ctx, widthDots, height) };
  };
}
