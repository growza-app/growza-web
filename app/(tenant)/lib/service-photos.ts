import type { Service } from './api';

/**
 * Jira GRW-560 — the supplied pack, and the order a thumbnail is chosen in.
 *
 * Owners type their own service names and will not photograph sixty haircuts,
 * so the API decides which CONCEPT a service is (`catalogKey`, set once at
 * write time) and this file turns that concept into a picture.
 *
 * The files live here rather than in the bucket on purpose: they are the same
 * forty for every business, so storing a
 * copy per tenant would pay S3 to hold the same bytes a thousand times and pay
 * the API box to serve what Next already serves with a hashed, immutable cache.
 *
 * The order is: **the owner's own upload, then the pack, then nothing** (an empty tile).
 * An upload always wins; it is the one picture that is actually of this salon.
 */

/**
 * The concepts a photograph exists for — 40 of the API's 45. The five with no
 * picture (`head-shave`, `head-massage`, `foot-reflexology`, `nail-extensions`,
 * `saree-draping`) fall through to the empty tile, which is the right answer
 * until somebody makes them.
 *
 * Written out rather than globbed because a `src` built from a server-supplied
 * string is a path, and a path should only ever be one of these. A key the API
 * knows and this list does not simply falls through to the empty tile, which
 * is what should happen while the API is a deploy ahead.
 *
 * One file per key, deliberately. Several concepts could share one photograph —
 * the four straightening chemistries are near-identical at the 44px a thumbnail
 * draws at — but sharing needs a second map from key to file, and a map is a
 * thing that drifts. A duplicate-looking picture is a smaller problem than a
 * wrong one.
 *
 * **The spellings here are not checked against anything.** `service-photos.test.ts`
 * walks this list against `public/catalog/` in both directions, so a key with no
 * file and a file with no key both fail — but both sides of that check are ours.
 * A key that is internally consistent and WRONG relative to the API's `CONCEPTS`
 * passes everything: write `hair-color` here and name the file to match, and the
 * suite is green while `hair-colour` — which is what the API actually sends, on
 * the commonest service a salon sells — silently falls to the empty tile and the
 * file ships as weight nothing requests. Nothing in either repo can catch that
 * today, because `CONCEPTS` lives in `growza` and is not published in
 * `@growza-app/shared`. Moving it there is the fix; until then, check a new key's
 * spelling against `src/modules/catalog/catalog-keys.ts` by hand.
 *
 * Exported for that disk guard; nothing else should import it.
 */
export const PACK_KEYS: ReadonlySet<string> = new Set([
  'anti-acne-facial',
  'aroma-facial',
  'beard-trim',
  'bleach',
  'blow-dry',
  'body-massage',
  'body-polishing',
  'bridal-makeup',
  'cleanup',
  'crimping',
  'detan',
  'face-polishing',
  'facial',
  'fringe-cut',
  'galvanic-facial',
  'gel-polish',
  'hair-colour',
  'hair-curling',
  'hair-do',
  'hair-rebonding',
  'hair-relaxing',
  'hair-smoothening',
  'hair-spa',
  'hair-straightening',
  'hair-styling',
  'hair-wash',
  'haircut',
  'haircut-kids',
  'keratin-treatment',
  'makeup',
  'manicure',
  'moustache-trim',
  'nose-cleaning',
  'oxygen-facial',
  'pedicure',
  'perming',
  'root-touch-up',
  'shaving',
  'threading',
  'waxing',
]);

/** The concepts an owner can pick from, in the order the pack lists them — for the "Choose a photo" sheet. */
export const PACK_KEY_LIST: readonly string[] = [...PACK_KEYS];

/** The pack's picture for a concept, or null when that one has not been made yet. */
export function packPhotoUrl(catalogKey: string | null | undefined): string | null {
  return catalogKey && PACK_KEYS.has(catalogKey) ? `/catalog/${catalogKey}.webp` : null;
}

type PhotoFields = Pick<Service, 'imageUrl'> & { catalogKey?: string | null };

/** Is there a real picture of this service — the owner's own, or the pack's? Drives the "Add a photo" / "Change photo" wording. */
export function hasServicePhoto(service: PhotoFields): boolean {
  return servicePhotoUrl(service) !== null;
}

/** The owner's own upload wins; then the pack. Null when there is neither — the screen draws an empty tile (ServicePhoto), never a stock photograph. */
export function servicePhotoUrl(service: PhotoFields): string | null {
  return service.imageUrl ?? packPhotoUrl(service.catalogKey);
}
