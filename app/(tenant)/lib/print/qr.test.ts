import { describe, expect, it } from 'vitest';
import { dotAt } from './bitmap';
import { encodeQr, formatBits, gfMul, maskApplies, qrBitmap, versionBits, type QrCode } from './qr';

/**
 * Jira GRW-729 — the QR printed on the bill, read back.
 *
 * The reader below shares no code with the encoder: it marks the fixed patterns from the standard's own geometry,
 * reads the format bits off the symbol, takes the mask off, walks the codewords, checks every block's Reed–Solomon
 * syndromes are zero (so the error correction is real, not just bytes in the right places), and parses the data.
 * The constants it checks against are the standard's published tables.
 */

/** Level M, versions 1–10: blocks and error-correction codewords per block (ISO/IEC 18004 table 9). */
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

const EXP: number[] = [];
const LOG: number[] = new Array(256).fill(0);
for (let i = 0, x = 1; i < 255; i += 1) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}

function decode(qr: QrCode): { text: string; mask: number; syndromesZero: boolean } {
  const s = qr.size;
  const ver = (s - 17) / 4;
  const m = (x: number, y: number) => qr.modules[y]![x]!;
  // Format: the first copy, as the standard lays it out round the top-left finder.
  let fmt = 0;
  const order: [number, number][] = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  order.forEach(([x, y], i) => {
    if (m(x, y)) fmt |= 1 << i;
  });
  const unmasked = fmt ^ 0x5412;
  expect(unmasked >>> 13, 'level M').toBe(0);
  const mask = (unmasked >>> 10) & 7;

  const fixed = Array.from({ length: s }, () => new Array<boolean>(s).fill(false));
  const box = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) if (x >= 0 && y >= 0 && x < s && y < s) fixed[y]![x] = true;
  };
  box(0, 0, 9, 9);
  box(s - 8, 0, 8, 9);
  box(0, s - 8, 9, 8);
  box(6, 0, 1, s);
  box(0, 6, s, 1);
  const a = ALIGN[ver]!;
  for (const ax of a) for (const ay of a) if (!((ax === 6 && ay === 6) || (ax === 6 && ay === a.at(-1)) || (ax === a.at(-1) && ay === 6))) box(ax - 2, ay - 2, 5, 5);
  if (ver >= 7) {
    box(s - 11, 0, 3, 6);
    box(0, s - 11, 6, 3);
  }

  // Two-column strips from the right, up then down, stepping over the vertical timing column.
  const bits: number[] = [];
  let up = true;
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < s; k += 1) {
      const y = up ? s - 1 - k : k;
      for (const x of [right, right - 1]) if (!fixed[y]![x]) bits.push(m(x, y) !== maskApplies(mask, x, y) ? 1 : 0);
    }
    up = !up;
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduce((p, b) => (p << 1) | b, 0));

  // De-interleave: the short blocks first, then the long ones, data then error correction.
  const nb = BLOCKS[ver]!;
  const ecc = ECC[ver]!;
  const total = bytes.length;
  const shortLen = Math.floor(total / nb);
  const numLong = total % nb;
  const lens = Array.from({ length: nb }, (_, i) => shortLen + (i >= nb - numLong ? 1 : 0));
  const blocks = lens.map(() => [] as number[]);
  let k = 0;
  for (let i = 0; i < Math.max(...lens) - ecc; i += 1) for (let j = 0; j < nb; j += 1) if (i < lens[j]! - ecc) blocks[j]!.push(bytes[k++]!);
  for (let i = 0; i < ecc; i += 1) for (let j = 0; j < nb; j += 1) blocks[j]!.push(bytes[k++]!);

  // Reed–Solomon: the block as a polynomial is zero at α^0 … α^(ecc−1).
  let syndromesZero = true;
  for (const block of blocks) {
    for (let r = 0; r < ecc; r += 1) {
      let v = 0;
      for (const c of block) v = (v === 0 ? 0 : EXP[(LOG[v]! + r) % 255]!) ^ c;
      if (v !== 0) syndromesZero = false;
    }
  }

  const data = blocks.flatMap((b) => b.slice(0, b.length - ecc));
  const dbits = data.flatMap((b) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (b >>> i) & 1));
  const read = (from: number, len: number) => dbits.slice(from, from + len).reduce((p, b) => (p << 1) | b, 0);
  expect(read(0, 4), 'byte mode').toBe(0b0100);
  const countBits = ver <= 9 ? 8 : 16;
  const n = read(4, countBits);
  const payload = Array.from({ length: n }, (_, i) => read(4 + countBits + i * 8, 8));
  return { text: new TextDecoder().decode(Uint8Array.from(payload)), mask, syndromesZero };
}

const UPI = 'upi://pay?pa=spicegarden%40okicici&pn=Spice%20Garden&am=540.00&cu=INR&tn=SG%2F25-26%2F0042';

describe('the standard’s own numbers', () => {
  it('format bits for level M, every mask, match the published table', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((m) => formatBits(m).toString(2).padStart(15, '0'))).toEqual([
      '101010000010010', '101000100100101', '101111001111100', '101101101001011',
      '100010111111001', '100000011001110', '100111110010111', '100101010100000',
    ]);
  });

  it('version 7’s version bits are 000111110010010100; GF(256) multiplies with 0x11D', () => {
    expect(versionBits(7).toString(2).padStart(18, '0')).toBe('000111110010010100');
    expect(gfMul(0x80, 2)).toBe(0x1d);
    expect(gfMul(EXP[100]!, EXP[200]!)).toBe(EXP[45]);
  });
});

describe('a UPI payment QR reads back exactly (FR-01)', () => {
  it('the bill’s link: VPA, payee, ₹540.00, INR and the bill number — and every block’s error correction is right', () => {
    const qr = encodeQr(UPI);
    expect(qr.size).toBe(qr.version * 4 + 17);
    const back = decode(qr);
    expect(back.text).toBe(UPI);
    expect(back.syndromesZero).toBe(true);
    const url = new URL(back.text.replace('upi://pay', 'https://upi.invalid/pay'));
    expect(url.searchParams.get('pa')).toBe('spicegarden@okicici');
    expect(url.searchParams.get('am')).toBe('540.00');
    expect(url.searchParams.get('cu')).toBe('INR');
    expect(url.searchParams.get('tn')).toBe('SG/25-26/0042');
  });

  it('the smallest version that holds it: 14 bytes is version 1, 15 is version 2 (level M’s 14-byte limit)', () => {
    expect(encodeQr('a'.repeat(14)).version).toBe(1);
    expect(encodeQr('a'.repeat(15)).version).toBe(2);
  });

  it('every version up to 10 decodes, multi-block and with version bits (7+), at a length that fills it', () => {
    for (const [len, ver] of [[26, 2], [42, 3], [62, 4], [84, 5], [106, 6], [122, 7], [152, 8], [180, 9], [213, 10]] as const) {
      const text = Array.from({ length: len }, (_, i) => String.fromCharCode(97 + ((i * 7) % 26))).join('');
      const qr = encodeQr(text);
      expect(qr.version, `${len} bytes`).toBe(ver);
      const back = decode(qr);
      expect(back.text).toBe(text);
      expect(back.syndromesZero, `version ${ver}`).toBe(true);
    }
  });

  it('a payee name in Hindi survives as UTF-8', () => {
    const text = 'upi://pay?pa=a%40ybl&pn=' + encodeURIComponent('स्पाइस गार्डन') + '&am=99.00&cu=INR&tn=7';
    expect(decode(encodeQr(text)).text).toBe(text);
  });
});

describe('as the roll prints it', () => {
  it('whole dots per module, a 4-module quiet zone, centred, inside the roll — on 58mm and 80mm', () => {
    const qr = encodeQr(UPI);
    for (const width of [384, 576]) {
      const bmp = qrBitmap(qr, width);
      expect(bmp.width).toBe(width);
      const dot = bmp.height / (qr.size + 8);
      expect(Number.isInteger(dot)).toBe(true);
      expect(dot).toBeGreaterThanOrEqual(3);
      expect(bmp.height).toBeLessThanOrEqual(width * 0.6 + 8);
      const left = Math.floor((width - bmp.height) / 2);
      // The top-left finder's corner is dark; the quiet zone round it is paper.
      expect(dotAt(bmp, left + 4 * dot, 4 * dot)).toBe(true);
      expect(dotAt(bmp, left + 4 * dot - 1, 4 * dot)).toBe(false);
      expect(dotAt(bmp, left + 4 * dot, 4 * dot - 1)).toBe(false);
      // Each module reads back from the middle of its dots.
      for (let y = 0; y < qr.size; y += 1) for (let x = 0; x < qr.size; x += 1) expect(dotAt(bmp, left + (4 + x) * dot + 1, (4 + y) * dot + 1)).toBe(qr.modules[y]![x]);
    }
  });
});
