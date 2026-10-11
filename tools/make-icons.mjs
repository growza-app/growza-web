/**
 * The Growza app icon, generated from the brand mark.
 *
 * The mark's three paths and `#0E7A4F` are copied verbatim out of the design
 * canvas export ("Growza Logo.html", the "Growza — App icon" artboard) — a
 * chat bubble with a growth arrow breaking out of a ring. Nothing here is
 * redrawn by hand, so a change to the artboard is a change to these constants
 * and nothing else.
 *
 *   node tools/make-icons.mjs
 *
 * Run it when the mark changes. The PNGs it writes are committed, and this is
 * deliberately NOT part of the build: six files that change once a year do not
 * belong in every `next build`.
 *
 * `sharp` is not in package.json — it arrives with `next`, which uses it for
 * image optimisation, so a normal `npm install` already has it. If Next ever
 * drops it this script stops resolving; `npm i -D sharp` for the one run, and
 * do not add it to the dependency list for a script nobody runs in CI.
 */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const BUBBLE = 'M34 8 H62 A26 26 0 0 1 88 34 V58 A26 26 0 0 1 62 84 H40 L16 95 Q12 96.5 13 92 L17 76 A26 26 0 0 1 8 58 V34 A26 26 0 0 1 34 8 Z';
const ARC = 'M51.47 26.3 A20 20 0 1 0 67.7 49.47';
const ARROW = 'M47 49 L73 28 M62 28 H73 V39';
const BRAND = '#0E7A4F';

/**
 * `inset` is the mark's width as a fraction of the icon's edge:
 *
 *   0.60  the artboard's own ratio, for an icon shown as drawn
 *   0.46  maskable — Android may crop to a circle of 80% of the edge, so the
 *         mark sits inside it and the corners are given away
 *   0.86  the 32px favicon, which is also the one that drops `ring`
 *
 * `ring` draws the arc the arrow breaks out of. It is off for the favicon and
 * nowhere else: at 32px the arc is under a pixel wide and the whole mark
 * collapses into a blob — rendered side by side, the bubble, the ring and the
 * arrow are one shape. A bubble with a growth arrow in it reads at that size
 * and says the same thing, so the favicon keeps the idea and loses a stroke
 * rather than keeping every stroke and losing the idea.
 *
 * `arrowWidth` goes up to 10 with the ring gone, because the arrow is then
 * carrying the mark by itself and 7 is thin against white at 32px.
 */
function icon({ size, inset, radius, ring = true, arrowWidth = 7 }) {
  const m = size * inset;
  const x = (size - m) / 2;
  const y = (size - (m * 100) / 96) / 2; // the mark's box is 96×100, not square
  const s = m / 96;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${BRAND}"/>` +
      `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(5)})">` +
      `<path d="${BUBBLE}" fill="#FFFFFF"/>` +
      (ring
        ? `<path d="${ARC}" fill="none" stroke="${BRAND}" stroke-width="8" stroke-linecap="round"/>`
        : '') +
      `<path d="${ARROW}" fill="none" stroke="${BRAND}" stroke-width="${arrowWidth}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</g></svg>`,
  );
}

/* The artboard rounds 400px at 92, which is 23% of the edge. */
const r = (size) => Math.round(size * 0.23);

const FILES = [
  // Next.js serves app/icon.png as the favicon.
  { out: 'app/icon.png', size: 32, inset: 0.86, radius: r(32), ring: false, arrowWidth: 10 },
  // iOS applies its own mask, so this one is square — rounding it here would
  // show the home screen's background through the corners.
  { out: 'public/icons/apple-touch-icon.png', size: 180, inset: 0.6, radius: 0 },
  { out: 'public/icons/icon-192.png', size: 192, inset: 0.6, radius: r(192) },
  { out: 'public/icons/icon-512.png', size: 512, inset: 0.6, radius: r(512) },
  { out: 'public/icons/icon-maskable-192.png', size: 192, inset: 0.46, radius: 0 },
  { out: 'public/icons/icon-maskable-512.png', size: 512, inset: 0.46, radius: 0 },
];

for (const f of FILES) {
  const png = await sharp(icon(f)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(f.out, png);
  console.log(`${f.out}  ${f.size}px  ${(png.length / 1024).toFixed(1)} kB`);
}
