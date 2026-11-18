import type { Bitmap } from './bitmap';

/**
 * Jira GRW-729 — a QR code, encoded here: byte mode, error correction level M, versions 1–40.
 *
 * ## Why it is written here and not installed
 *
 * The dashboard is thirteen dependencies and the rule is a decision on record before a fourteenth. A QR for a UPI
 * link is one well-specified algorithm (ISO/IEC 18004) that fits on a page: put the bytes in, add Reed–Solomon error
 * correction, lay the codewords out around the fixed patterns, pick the mask that scans best. This follows the
 * structure of Project Nayuki's public-domain reference encoder, kept to the one mode and one level the bill needs.
 * `qr.test.ts` decodes what it draws, bit by bit, with an independent reader.
 *
 * Level M survives about 15% of the code being lost: a crease, a smudge, a thermal roll fading at its edge.
 */

/** Error-correction codewords per block, and blocks, at level M, by version (index 0 unused). */
const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
/** Level M's two format bits. */
const FORMAT_M = 0;

export interface QrCode {
  version: number;
  size: number;
  /** `modules[y][x]`, true = dark. */
  modules: boolean[][];
}

export class QrTooLong extends Error {}

function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

/** How many data codewords a version carries at level M. */
export function dataCodewords(ver: number): number {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver]! * BLOCKS_M[ver]!;
}

export function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

/* ---------------------------------------------------------------------------------------- Reed–Solomon, GF(256) */

export function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMul(result[j]!, root);
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i]! ^= gfMul(coef, factor);
    });
  }
  return result;
}

/* --------------------------------------------------------------------------------------------------- the symbol */

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

function utf8(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

/** The data codewords: mode, length, the bytes, terminator, padding. */
function dataBits(bytes: number[], ver: number): number[] {
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capacity = dataCodewords(ver) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

/** Split into blocks, add each block's error correction, and interleave. */
function withEcc(data: number[], ver: number): number[] {
  const numBlocks = BLOCKS_M[ver]!;
  const eccLen = ECC_PER_BLOCK_M[ver]!;
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i += 1) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) result.push(block[i]!);
    });
  }
  return result;
}

export function maskApplies(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** The 15 format bits for level M and this mask, BCH-protected and masked with 0x5412. */
export function formatBits(mask: number): number {
  const data = (FORMAT_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** The 18 version bits (version 7 and up). */
export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

class Grid {
  readonly modules: boolean[][];
  readonly fixed: boolean[][];
  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }
  set(x: number, y: number, dark: boolean) {
    this.modules[y]![x] = dark;
    this.fixed[y]![x] = true;
  }
}

function drawFormat(g: Grid, mask: number) {
  const bits = formatBits(mask);
  const s = g.size;
  for (let i = 0; i <= 5; i += 1) g.set(8, i, bit(bits, i));
  g.set(8, 7, bit(bits, 6));
  g.set(8, 8, bit(bits, 7));
  g.set(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i += 1) g.set(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i += 1) g.set(s - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i += 1) g.set(8, s - 15 + i, bit(bits, i));
  g.set(8, s - 8, true);
}

function drawFixedPatterns(g: Grid, ver: number) {
  const s = g.size;
  for (let i = 0; i < s; i += 1) {
    g.set(6, i, i % 2 === 0);
    g.set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [s - 4, 3], [3, s - 4]] as const) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < s && y >= 0 && y < s) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          g.set(x, y, d !== 2 && d !== 4);
        }
      }
    }
  }
  const pos = alignmentPositions(ver);
  const n = pos.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) g.set(pos[i]! + dx, pos[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  drawFormat(g, 0); // a placeholder, so the codewords go round it; the real bits are drawn with the chosen mask
  if (ver >= 7) {
    const bits = versionBits(ver);
    for (let i = 0; i < 18; i += 1) {
      const a = s - 11 + (i % 3);
      const b = Math.floor(i / 3);
      g.set(a, b, bit(bits, i));
      g.set(b, a, bit(bits, i));
    }
  }
}

function drawCodewords(g: Grid, data: number[]) {
  const s = g.size;
  let i = 0;
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < s; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? s - 1 - vert : vert;
        if (!g.fixed[y]![x] && i < data.length * 8) {
          g.modules[y]![x] = bit(data[i >>> 3]!, 7 - (i & 7));
          i += 1;
        }
      }
    }
  }
}

function applyMask(g: Grid, mask: number) {
  for (let y = 0; y < g.size; y += 1) for (let x = 0; x < g.size; x += 1) if (!g.fixed[y]![x] && maskApplies(mask, x, y)) g.modules[y]![x] = !g.modules[y]![x];
}

/** How hard a mask makes the symbol to scan (the standard's four penalty rules). Lower is better. */
function penalty(m: boolean[][]): number {
  const s = m.length;
  let score = 0;
  const line = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < s; i += 1) {
      let run = 1;
      for (let j = 1; j <= s; j += 1) {
        if (j < s && get(i, j) === get(i, j - 1)) run += 1;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      // A finder-like 1:1:3:1:1 with four light modules to one side.
      for (let j = 0; j + 10 < s; j += 1) {
        const p = [...Array(11).keys()].map((k) => get(i, j + k));
        const core = p[0] && !p[1] && p[2] && p[3] && p[4] && !p[5] && p[6];
        if (core && !p[7] && !p[8] && !p[9] && !p[10]) score += 40;
        const rev = !p[0] && !p[1] && !p[2] && !p[3] && p[4] && !p[5] && p[6] && p[7] && p[8] && !p[9] && p[10];
        if (rev) score += 40;
      }
    }
  };
  line((i, j) => m[i]![j]!);
  line((i, j) => m[j]![i]!);
  let dark = 0;
  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      if (m[y]![x]) dark += 1;
      if (x + 1 < s && y + 1 < s && m[y]![x] === m[y]![x + 1] && m[y]![x] === m[y + 1]![x] && m[y]![x] === m[y + 1]![x + 1]) score += 3;
    }
  }
  score += Math.floor(Math.abs(dark * 20 - s * s * 10) / (s * s)) * 10;
  return score;
}

/** The smallest QR (level M) that holds `text`, with the mask that scans best. Throws `QrTooLong` past version 40. */
export function encodeQr(text: string): QrCode {
  const bytes = utf8(text);
  let ver = 1;
  for (; ver <= 40; ver += 1) if (4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  if (ver > 40) throw new QrTooLong('too long for a QR');
  const codewords = withEcc(dataBits(bytes, ver), ver);
  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const g = new Grid(ver * 4 + 17);
    drawFixedPatterns(g, ver);
    drawCodewords(g, codewords);
    applyMask(g, mask);
    drawFormat(g, mask);
    const score = penalty(g.modules);
    if (score < bestScore) {
      best = g;
      bestScore = score;
    }
  }
  return { version: ver, size: best!.size, modules: best!.modules };
}

/**
 * The QR as a thermal raster, as wide as the roll and centred, with the four-module quiet zone a scanner needs. Each
 * module is a whole number of dots — a module drawn 4.5 dots wide prints as 4 and 5 alternately, and scans badly —
 * as big as fits in 60% of the roll, and never under 3 dots (0.375 mm), below which a phone's camera struggles.
 */
export function qrBitmap(qr: QrCode, widthDots: number): Bitmap {
  const width = Math.ceil(widthDots / 8) * 8;
  const span = qr.size + 8;
  const dot = Math.max(3, Math.min(8, Math.floor((widthDots * 0.6) / span)));
  const side = span * dot;
  const left = Math.max(0, Math.floor((width - side) / 2));
  const bits = new Uint8Array((width / 8) * side);
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (!qr.modules[y]![x]) continue;
      for (let dy = 0; dy < dot; dy += 1) {
        const row = (4 + y) * dot + dy;
        for (let dx = 0; dx < dot; dx += 1) {
          const col = left + (4 + x) * dot + dx;
          if (col < width) bits[row * (width / 8) + (col >> 3)]! |= 0x80 >> (col & 7);
        }
      }
    }
  }
  return { width, height: side, bits };
}
