/**
 * The Growza app icon, generated from the brand mark.
 *
 * Renders the bold white `G` ring + upward-right growth arrow directly on the
 * emerald gradient squircle (`#159360` -> `#0B613E`), without the outer speech
 * bubble wrapper that previously shrank the inner `G`-arrow to ~25% of the
 * mobile home-screen icon.
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

const G_ARC = 'M 61.2 44.2 A 31 31 0 1 0 95.8 78.8';
const G_ARROW = 'M 65 75 L 104 36 M 82 36 H 104 V 58';
const GRAD_START = '#159360';
const GRAD_END = '#0B613E';

/**
 * The mark sits in a 140x140 coordinate space where the outer stroke box is
 * 83x83 centered at (70, 70).
 *
 * `scale` adjusts the mark relative to the 140x140 box:
 *   1.00  standard icon (`appleTouch`, `192`, `512`) — ~60% of the icon width
 *   0.90  maskable — sits comfortably inside Android's 80% safe circle
 *   1.12  32px favicon — slightly larger and thicker so both strokes stay crisp
 */
function icon({ size, scale = 1, radius, arcWidth = 14.5, arrowWidth = 13.5 }) {
  const s = (size / 140) * scale;
  const offset = (size * (1 - scale)) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<defs>` +
      `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="${GRAD_START}"/>` +
      `<stop offset="100%" stop-color="${GRAD_END}"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#bg)"/>` +
      `<g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${s.toFixed(5)})">` +
      `<path d="${G_ARC}" fill="none" stroke="#FFFFFF" stroke-width="${arcWidth}" stroke-linecap="round"/>` +
      `<path d="${G_ARROW}" fill="none" stroke="#FFFFFF" stroke-width="${arrowWidth}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</g></svg>`,
  );
}

/* The artboard rounds 400px at 92, which is 23% of the edge. */
const r = (size) => Math.round(size * 0.23);

const FILES = [
  // Next.js serves app/icon.png as the favicon, and fingerprints the URL itself — this one is not hashed here.
  { key: 'favicon', out: 'app/icon.png', size: 32, scale: 1.12, radius: r(32), arcWidth: 16, arrowWidth: 15 },
  // iOS applies its own mask, so this one is square — rounding it here would
  // show the home screen's background through the corners.
  { key: 'appleTouch', stem: 'apple-touch-icon', size: 180, scale: 1, radius: 0 },
  { key: 'icon192', stem: 'icon-192', size: 192, scale: 1, radius: r(192) },
  { key: 'icon512', stem: 'icon-512', size: 512, scale: 1, radius: r(512) },
  { key: 'maskable192', stem: 'icon-maskable-192', size: 192, scale: 0.9, radius: 0 },
  { key: 'maskable512', stem: 'icon-maskable-512', size: 512, scale: 0.9, radius: 0 },
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
