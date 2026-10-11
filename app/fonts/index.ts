import localFont from 'next/font/local';

/**
 * The three faces this product is set in, as files in the repository.
 *
 * They were `next/font/google` until a release could not be built: `next build` downloads the files from
 * Google at build time, and when that fetch failed inside the Docker build the whole deploy stopped with
 * `Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` — a sentence about
 * Turbopack internals for what was really a network reaching outside the build. Nothing in the release had
 * touched a font. The same build now has no opinion about whether Google is up.
 *
 * What is served is unchanged: the same three variable woff2 files from fonts.gstatic.com, the same subsets
 * (latin for the two sans faces, devanagari for the Hindi one), the same CSS variables, and the same
 * `display: swap`. One file per family covers every weight, which is why there are three files and not
 * fourteen. `next/font/local` still fingerprints, preloads and serves them from this origin, so an owner's
 * phone makes no request to Google either way.
 *
 * To update one: take the woff2 the Google Fonts CSS points at for that family and subset, and replace the
 * file. The weight RANGE below has to match what the family actually ships.
 */

/** The product's own face. */
export const figtree = localFont({
  src: './figtree-latin-var.woff2',
  weight: '400 800',
  style: 'normal',
  display: 'swap',
  variable: '--font-figtree',
});

/** Hindi. Devanagari only — the latin in this family is never reached, Figtree answers for it. */
export const devanagari = localFont({
  src: './noto-sans-devanagari-var.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'swap',
  variable: '--font-devanagari',
});

/** The admin plane's face, which is deliberately not the salon app's. */
export const hanken = localFont({
  src: './hanken-grotesk-latin-var.woff2',
  weight: '400 800',
  style: 'normal',
  display: 'swap',
});
