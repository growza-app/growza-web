import { describe, expect, it } from 'vitest';
import { bitmapDataUrl, dotAt, fitInside, logoMaxHeight, toBitmap, type Bitmap } from './bitmap';
import { encodeTicket, type Rasterize } from './escpos';
import { ticketHtml } from './ticket-html';
import { billTicket, dotsPerLine, itemLines, type BillCopy, type BillData } from './ticket';

/**
 * Jira GRW-728 — the business logo on the printed bill: one bit a dot, as wide as the roll at most, no taller than 30%
 * of the roll's width, above the business's name — and a bill with no logo exactly as it was.
 */
const copy: BillCopy = {
  reprint: 'REPRINT',
  phone: (v) => `Mob No - ${v}`,
  gstin: (v) => `GSTIN - ${v}`,
  fssai: (v) => `FSSAI- ${v}`,
  name: (v) => `Name: ${v}`,
  date: (v) => `Date: ${v}`,
  cashier: (v) => `Cashier: ${v}`,
  billNo: (v) => `Bill No.: ${v}`,
  token: (n) => `Token #${n}`,
  colItem: 'Item',
  colQty: 'Qty.',
  colPrice: 'Price',
  colAmount: 'Amount',
  totalQty: (n) => `Total Qty: ${n}`,
  subTotal: 'Sub Total',
  roundOff: 'Round off',
  grandTotal: 'Grand Total',
  thanks: 'Thank you',
};

const bill = (over: Partial<BillData> = {}): BillData => ({
  businessName: 'Spice Garden',
  docTitle: 'Tax invoice',
  customerName: null,
  when: '18/11/26 20:15',
  orderLabel: 'Dine-in · T5',
  cashier: 'Pooja',
  number: 'SG/25-26/0042',
  tokenNo: null,
  items: [
    { name: 'Butter Chicken', qty: 2, price: '220.00', amount: '440.00' },
    { name: 'Garlic Naan', qty: 2, price: '50.00', amount: '100.00' },
  ],
  totalQty: 4,
  subTotal: '540.00',
  adjustments: [],
  roundOff: null,
  grandTotal: '₹540.00',
  paidBy: null,
  ...over,
});

const noRaster: Rasterize = (_line, w) => ({ width: w, height: 1, bits: new Uint8Array(w / 8) });

/** A solid picture of one colour, `w` × `h`, as a canvas would hand it over. */
function solid(w: number, h: number, rgba: [number, number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) px.set(rgba, i * 4);
  return px;
}

const blackCount = (bmp: Bitmap) => {
  let n = 0;
  for (let y = 0; y < bmp.height; y += 1) for (let x = 0; x < bmp.width; x += 1) if (dotAt(bmp, x, y)) n += 1;
  return n;
};

describe('the size it prints at (FR-02, AC-03)', () => {
  it('a square logo on a 58mm roll is 115 dots tall — 30% of the 384-dot width — and never wider than the roll', () => {
    expect(logoMaxHeight(dotsPerLine('58'))).toBe(115);
    expect(fitInside(384, 384, 384, 115)).toEqual({ width: 115, height: 115 });
  });

  it('a wide banner fills the roll and stays under 30% tall, on both rolls', () => {
    for (const w of ['58', '80'] as const) {
      const dots = dotsPerLine(w);
      const box = fitInside(1200, 300, dots, logoMaxHeight(dots));
      expect(box.width).toBeLessThanOrEqual(dots);
      expect(box.height).toBeLessThanOrEqual(Math.floor(dots * 0.3));
    }
    expect(fitInside(1200, 300, 384, 115)).toEqual({ width: 384, height: 96 });
  });

  it('a small logo is drawn larger to fill its room on an 80mm roll; a picture with no size draws nothing', () => {
    expect(fitInside(100, 100, 576, logoMaxHeight(576))).toEqual({ width: 172, height: 172 });
    expect(fitInside(0, 0, 576, 172)).toEqual({ width: 0, height: 0 });
  });
});

describe('one bit a dot', () => {
  it('a black square prints black, centred on the full width of the roll', () => {
    const bmp = toBitmap(solid(16, 4, [0, 0, 0, 255]), 16, 4, 384);
    expect(bmp.width).toBe(384);
    expect(bmp.height).toBe(4);
    expect(blackCount(bmp)).toBe(64);
    expect(dotAt(bmp, 184, 0)).toBe(true);
    expect(dotAt(bmp, 199, 3)).toBe(true);
    expect(dotAt(bmp, 183, 0)).toBe(false);
    expect(dotAt(bmp, 200, 0)).toBe(false);
  });

  it('see-through is paper, and a mid grey dithers to about half its dots — not all black, not all white', () => {
    expect(blackCount(toBitmap(solid(32, 32, [0, 0, 0, 0]), 32, 32, 384))).toBe(0);
    const grey = blackCount(toBitmap(solid(32, 32, [128, 128, 128, 255]), 32, 32, 384));
    expect(grey).toBeGreaterThan(1024 * 0.4);
    expect(grey).toBeLessThan(1024 * 0.6);
  });

  it('an orange logo still prints, as a pattern of dots, where a plain threshold would print nothing at all', () => {
    expect(blackCount(toBitmap(solid(32, 32, [240, 160, 40, 255]), 32, 32, 384, 'threshold'))).toBe(0);
    const orange = blackCount(toBitmap(solid(32, 32, [240, 160, 40, 255]), 32, 32, 384));
    expect(orange).toBeGreaterThan(1024 * 0.2);
    expect(orange).toBeLessThan(1024 * 0.5);
  });
});

describe('the bill with a logo (AC-01, AC-03)', () => {
  const logo = toBitmap(solid(115, 115, [0, 0, 0, 255]), 115, 115, 384);

  it('the logo is the first thing on the bill, above the business name', () => {
    const lines = billTicket(bill({ logo }), copy).lines;
    expect(lines[0]).toEqual({ kind: 'image', bitmap: logo });
    expect(lines[1]).toMatchObject({ kind: 'text', text: 'Spice Garden' });
  });

  it('a reprint still says so first; the logo comes next', () => {
    const lines = billTicket(bill({ logo, reprint: true }), copy).lines;
    expect(lines[0]).toMatchObject({ kind: 'text', text: '** REPRINT **' });
    expect(lines[1]).toMatchObject({ kind: 'image' });
  });

  it('ESC/POS: the logo goes out as one GS v 0 raster, 48 bytes (384 dots) wide and 115 rows, centred', () => {
    const bytes = encodeTicket(billTicket(bill({ logo }), copy), '58', noRaster);
    const at = bytes.findIndex((b, i) => b === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30);
    expect(at).toBeGreaterThan(0);
    expect([...bytes.slice(at - 3, at)]).toEqual([0x1b, 0x61, 1]);
    expect(bytes[at + 4]! | (bytes[at + 5]! << 8)).toBe(48);
    expect(bytes[at + 6]! | (bytes[at + 7]! << 8)).toBe(115);
  });

  it('the items table prints exactly the same with and without the logo (AC-03, 58mm)', () => {
    const strip = (b: Uint8Array) => {
      const s = String.fromCharCode(...b);
      return s.slice(s.indexOf('Item'));
    };
    expect(strip(encodeTicket(billTicket(bill({ logo }), copy), '58', noRaster))).toBe(strip(encodeTicket(billTicket(bill(), copy), '58', noRaster)));
    expect(itemLines({ name: 'Butter Chicken', qty: '2', price: '220.00', amount: '440.00' }, '58')[0]!.length).toBe(32);
  });

  it('the print dialog shows the same dots as a 1-bit picture as wide as the roll', () => {
    const html = ticketHtml(billTicket(bill({ logo }), copy));
    expect(html.indexOf('<img class="tp-image" src="data:image/bmp;base64,')).toBe(0);
    expect(html.indexOf('tp-image')).toBeLessThan(html.indexOf('Spice Garden'));
  });

  it('no logo: the bill starts with the name, and has no picture at all (FR-03)', () => {
    const lines = billTicket(bill({ logo: null }), copy).lines;
    expect(lines[0]).toMatchObject({ kind: 'text', text: 'Spice Garden' });
    expect(lines.some((l) => l.kind === 'image')).toBe(false);
    expect(ticketHtml(billTicket(bill(), copy))).not.toContain('<img');
  });
});

describe('the 1-bit BMP the dialog and the Settings preview draw', () => {
  it('is a valid 1-bit BMP of the bitmap, rows bottom-up, black where the printer burns a dot', () => {
    const bmp = toBitmap(solid(8, 2, [0, 0, 0, 255]), 8, 2, 16);
    const raw = Uint8Array.from(atob(bitmapDataUrl(bmp).split(',')[1]!), (c) => c.charCodeAt(0));
    const view = new DataView(raw.buffer);
    expect(String.fromCharCode(raw[0]!, raw[1]!)).toBe('BM');
    expect(view.getInt32(18, true)).toBe(16);
    expect(view.getInt32(22, true)).toBe(2);
    expect(view.getUint16(28, true)).toBe(1);
    expect(view.getUint32(2, true)).toBe(raw.length);
    // Palette: 0 white, 1 black. Each row is 4 bytes (padded); the black square is the middle 8 dots of 16.
    expect([...raw.slice(54, 62)]).toEqual([0xff, 0xff, 0xff, 0, 0, 0, 0, 0]);
    expect([...raw.slice(62, 66)]).toEqual([0x0f, 0xf0, 0, 0]);
  });
});
