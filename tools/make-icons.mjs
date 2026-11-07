/**
 * The Growza app icon, generated from the brand mark.
 *
 * The mark is growza.biz's sprout (https://growza.biz/favicon.svg, 2026-11-07): a mint leaf and a white leaf rising
 * from one stem, on the deep green squircle (`#1E7E45` -> `#0A2E20`) with a faint white inner edge, drawn on the same
 * 140x140 box as the site's file. The site's four-point star spark is left out (owner, 2026-11-07): it is the sign
 * most apps now use for "AI", and at 16px it was a two-pixel smudge.
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

/* growza.biz/favicon.svg, path for path. */
const BG_START = '#1E7E45';
const BG_END = '#0A2E20';
const MINT_START = '#10B981';
const MINT_END = '#6EE7B7';
const MINT_LEAF = 'M 58 106 C 34 98, 22 76, 26 48 C 52 52, 64 74, 58 106 Z';
const WHITE_LEAF = 'M 65 108 C 62 66, 78 38, 112 28 C 110 68, 94 100, 65 108 Z';

/**
 * Everything is drawn in the mark's own 140x140 space and scaled to `size` as a whole.
 *
 * `scale` sizes the sprout about the centre, leaving the squircle where it is:
 *   1.00  standard icon (`appleTouch`, `192`, `512`) — exactly the site's mark
 *   0.90  maskable — the white leaf's tip, the farthest point, lands at 38% of the edge from the centre: inside
 *         Android's 40% safe circle (at 1.00 it is 42%, and a round mask would clip it)
 *   1.12  32px favicon — a little larger, so the two leaves stay distinct at 32 and 16 pixels; it stays inside the corners
 *
 * `radius` is in the 140 space: 34 is the mark's own corner. 0 for the icons a platform masks itself (iOS, Android
 * maskable) — a rounded corner there shows the home screen through it. `edge` is the faint inner border: kept on the
 * rounded icons, where it follows the corner, and dropped where the platform's mask would cut across it or, at 32px, it
 * is under half a pixel and only blurs the edge.
 */
function icon({ size, scale = 1, radius = 34, edge = true }) {
  const k = scale.toFixed(4);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 140 140">` +
      `<defs>` +
      `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="${BG_START}"/><stop offset="100%" stop-color="${BG_END}"/>` +
      `</linearGradient>` +
      `<linearGradient id="mint" x1="0" y1="1" x2="1" y2="0">` +
      `<stop offset="0%" stop-color="${MINT_START}"/><stop offset="100%" stop-color="${MINT_END}"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<rect width="140" height="140" rx="${radius}" fill="url(#bg)"/>` +
      (edge ? `<rect x="3" y="3" width="134" height="134" rx="${Math.max(radius - 3, 0)}" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2"/>` : '') +
      `<g transform="translate(70 70) scale(${k}) translate(-70 -70)">` +
      `<path d="${MINT_LEAF}" fill="url(#mint)"/>` +
      `<path d="${WHITE_LEAF}" fill="#ffffff"/>` +
      `</g></svg>`,
  );
}

const FILES = [
  // Next.js serves app/icon.png as the favicon, and fingerprints the URL itself — this one is not hashed here.
  { key: 'favicon', out: 'app/icon.png', size: 32, scale: 1.12, edge: false },
  // iOS applies its own mask, so this one is square — rounding it here would
  // show the home screen's background through the corners.
  { key: 'appleTouch', stem: 'apple-touch-icon', size: 180, scale: 1, radius: 0, edge: false },
  { key: 'icon192', stem: 'icon-192', size: 192, scale: 1 },
  { key: 'icon512', stem: 'icon-512', size: 512, scale: 1 },
  { key: 'maskable192', stem: 'icon-maskable-192', size: 192, scale: 0.9, radius: 0, edge: false },
  { key: 'maskable512', stem: 'icon-maskable-512', size: 512, scale: 0.9, radius: 0, edge: false },
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
