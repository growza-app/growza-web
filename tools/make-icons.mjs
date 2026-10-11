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
 * **The names carry a content hash**, and this script rewrites everything that points at them: both web
 * manifests and `app/icons.generated.ts`. The first time the mark changed (#184) the bytes changed and the
 * URLs did not, so nothing anywhere noticed — the service worker serves `/icons/` stale-while-revalidate,
 * the browser had a long-lived copy, and an installed app keeps whatever icon it captured on the day it was
 * added. The owner's home screen still showed the old letter after the release. A new icon is a new URL now,
 * which every cache misses by construction. An iPhone still needs a reinstall: iOS reads the icon once, at
 * Add to Home Screen, and never again.
 *
 * `sharp` is not in package.json — it arrives with `next`, which uses it for
 * image optimisation, so a normal `npm install` already has it. If Next ever
 * drops it this script stops resolving; `npm i -D sharp` for the one run, and
 * do not add it to the dependency list for a script nobody runs in CI.
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';

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
  // Next.js serves app/icon.png as the favicon, and fingerprints the URL itself — this one is not hashed here.
  { key: 'favicon', out: 'app/icon.png', size: 32, inset: 0.86, radius: r(32), ring: false, arrowWidth: 10 },
  // iOS applies its own mask, so this one is square — rounding it here would
  // show the home screen's background through the corners.
  { key: 'appleTouch', stem: 'apple-touch-icon', size: 180, inset: 0.6, radius: 0 },
  { key: 'icon192', stem: 'icon-192', size: 192, inset: 0.6, radius: r(192) },
  { key: 'icon512', stem: 'icon-512', size: 512, inset: 0.6, radius: r(512) },
  { key: 'maskable192', stem: 'icon-maskable-192', size: 192, inset: 0.46, radius: 0 },
  { key: 'maskable512', stem: 'icon-maskable-512', size: 512, inset: 0.46, radius: 0 },
];

const ICON_DIR = 'public/icons';
/* Eight hex characters: enough that two different marks cannot collide, short enough to read in a URL. */
const hashOf = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 8);

// Every icon this script has ever written goes, so a rename leaves nothing behind to be served for ever.
for (const name of await readdir(ICON_DIR)) {
  if (name.endsWith('.png')) await rm(`${ICON_DIR}/${name}`);
}

/** key -> the URL to serve it at, for the manifests and the generated module. */
const urls = {};

for (const f of FILES) {
  const png = await sharp(icon(f)).png({ compressionLevel: 9 }).toBuffer();
  const out = f.out ?? `${ICON_DIR}/${f.stem}.${hashOf(png)}.png`;
  await writeFile(out, png);
  if (f.stem) urls[f.key] = out.replace(/^public/, '');
  console.log(`${out}  ${f.size}px  ${(png.length / 1024).toFixed(1)} kB`);
}

/*
 * Rewrite what points at them. Matched on `key`, not on the old filename, so this keeps working when the
 * hash changes — which is every time the mark does, which is the whole point.
 */
const MANIFEST_ICONS = [
  { key: 'icon192', sizes: '192x192', purpose: 'any' },
  { key: 'icon512', sizes: '512x512', purpose: 'any' },
  { key: 'maskable192', sizes: '192x192', purpose: 'maskable' },
  { key: 'maskable512', sizes: '512x512', purpose: 'maskable' },
];

for (const manifest of ['public/manifest.json', 'public/admin-manifest.json']) {
  const json = JSON.parse(await readFile(manifest, 'utf8'));
  json.icons = MANIFEST_ICONS.map(({ key, sizes, purpose }) => ({ src: urls[key], sizes, type: 'image/png', purpose }));
  await writeFile(manifest, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`${manifest}  icons rewritten`);
}

const generated = 'app/icons.generated.ts';
await writeFile(
  generated,
  `/* Written by tools/make-icons.mjs. Do not edit: the names carry a content hash, so editing one by hand\n` +
    ` * points it at a file that is not there. Run \`node tools/make-icons.mjs\` instead. */\n` +
    `export const APP_ICONS = {\n` +
    Object.entries(urls)
      .map(([key, url]) => `  ${key}: '${url}',`)
      .join('\n') +
    `\n} as const;\n`,
);
console.log(`${generated}  written`);
