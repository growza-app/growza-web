import { charsPerLine, dotsPerLine, itemLines, pairLines, wrap, type PaperWidth, type Ticket, type TicketLine } from './ticket';

/**
 * Jira GRW-713 — a ticket as the ESC/POS bytes a Bluetooth thermal printer understands.
 *
 * ## Text where it can be, a picture where it must
 *
 * A cheap 58mm printer's own fonts hold ASCII and little else: no ₹, and no Devanagari at all. So each line goes out
 * the fast way — as text, in the printer's font — when it can be said in ASCII once the few symbols a bill uses are
 * spelt out ("₹" → "Rs."), and as a small bitmap the browser drew when it cannot: a Hindi dish name prints as itself
 * instead of as question marks (story BR-02). Text is sharper and many times fewer bytes over Bluetooth, which is why
 * the whole ticket is not simply one picture.
 *
 * The drawing is passed in (`Rasterize`), so these bytes are built and tested in Node with no canvas.
 */

export interface Bitmap {
  /** Width in dots, a multiple of 8. */
  width: number;
  height: number;
  /** One bit per dot, rows top to bottom, most significant bit leftmost; 1 = black. */
  bits: Uint8Array;
}

/** Draw one line (wrapped to the paper by the drawer itself, which can measure the glyphs) as a bitmap. */
export type Rasterize = (line: Exclude<TicketLine, { kind: 'rule' } | { kind: 'gap' }>, widthDots: number) => Bitmap;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** The symbols a bill uses that have an ASCII way of being said. Anything else non-ASCII makes the line a picture. */
const SPELT: Record<string, string> = {
  '₹': 'Rs.',
  '×': 'x',
  '−': '-',
  '–': '-',
  '—': '-',
  '·': '-',
  '…': '...',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
};

/** The line in printable ASCII, or null when it cannot be said in ASCII and must be drawn. */
export function asAscii(text: string): string | null {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code < 0x7f) out += ch;
    else if (ch in SPELT) out += SPELT[ch];
    else return null;
  }
  return out;
}

function bytes(...xs: number[]): number[] {
  return xs;
}

function ascii(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) out.push(s.charCodeAt(i));
  return out;
}

/** `GS v 0`: one raster image, the format every ESC/POS printer since the TM-T88 accepts. */
export function rasterBytes(bmp: Bitmap): number[] {
  const wBytes = bmp.width / 8;
  const out = [GS, 0x76, 0x30, 0x00, wBytes & 0xff, (wBytes >> 8) & 0xff, bmp.height & 0xff, (bmp.height >> 8) & 0xff];
  for (const b of bmp.bits) out.push(b);
  return out;
}

const ALIGN = { left: 0, center: 1, right: 2 } as const;

function textLine(line: Extract<TicketLine, { kind: 'text' }>, width: PaperWidth): number[] | null {
  const text = asAscii(line.text);
  if (text === null) return null;
  const size = line.size ?? 1;
  const cpl = Math.floor(charsPerLine(width) / size);
  const out = bytes(ESC, 0x61, ALIGN[line.align ?? 'left'], ESC, 0x45, line.bold ? 1 : 0, GS, 0x21, size === 2 ? 0x11 : 0x00);
  for (const l of wrap(text, cpl)) out.push(...ascii(l), LF);
  out.push(GS, 0x21, 0x00, ESC, 0x45, 0, ESC, 0x61, 0);
  return out;
}

function pairLine(line: Extract<TicketLine, { kind: 'pair' }>, width: PaperWidth): number[] | null {
  const left = asAscii(line.left);
  const right = asAscii(line.right);
  if (left === null || right === null) return null;
  const out = bytes(ESC, 0x45, line.bold ? 1 : 0);
  for (const l of pairLines(left, right, charsPerLine(width))) out.push(...ascii(l), LF);
  out.push(ESC, 0x45, 0);
  return out;
}

function itemLine(line: Extract<TicketLine, { kind: 'item' }>, width: PaperWidth): number[] | null {
  const name = asAscii(line.name);
  const qty = asAscii(line.qty);
  const price = asAscii(line.price);
  const amount = asAscii(line.amount);
  if (name === null || qty === null || price === null || amount === null) return null;
  const out = bytes(ESC, 0x45, line.header ? 1 : 0);
  for (const l of itemLines({ name, qty, price, amount }, width)) out.push(...ascii(l), LF);
  out.push(ESC, 0x45, 0);
  return out;
}

/** The whole ticket as bytes, ready to be written to the printer in chunks. */
export function encodeTicket(ticket: Ticket, width: PaperWidth, rasterize: Rasterize): Uint8Array {
  const out: number[] = [ESC, 0x40];
  const cpl = charsPerLine(width);
  for (const line of ticket.lines) {
    if (line.kind === 'gap') out.push(LF);
    else if (line.kind === 'rule') out.push(...ascii('-'.repeat(cpl)), LF);
    else {
      const asText = line.kind === 'text' ? textLine(line, width) : line.kind === 'pair' ? pairLine(line, width) : itemLine(line, width);
      if (asText) out.push(...asText);
      else out.push(ESC, 0x61, 0, ...rasterBytes(rasterize(line, dotsPerLine(width))));
    }
  }
  // Feed the last line past the tear bar, then cut where the printer has a cutter (ignored where it has none).
  out.push(ESC, 0x64, 4);
  if (ticket.cut) out.push(GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(out);
}
