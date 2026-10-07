import type { Service } from './api';

/**
 * Jira GRW-560 — the supplied pack, and the order a thumbnail is chosen in.
 *
 * Owners type their own service names and will not photograph sixty haircuts,
 * so the API decides which CONCEPT a service is (`catalogKey`, set once at
 * write time) and this file turns that concept into a picture.
 *
 * The files live here rather than in the bucket on purpose: they are the same
 * ten — seventy when the pack is finished — for every business, so storing a
 * copy per tenant would pay S3 to hold the same bytes a thousand times and pay
 * the API box to serve what Next already serves with a hashed, immutable cache.
 *
 * The order is: **the owner's own upload, then the pack, then a placeholder.**
 * An upload always wins; it is the one picture that is actually of this salon.
 */

/**
 * The concepts a photograph exists for, which is NOT every concept the API can
 * name — the pack is ten of twenty-five while the rest are being made.
 *
 * Written out rather than globbed because a `src` built from a server-supplied
 * string is a path, and a path should only ever be one of these. A key the API
 * knows and this list does not simply falls through to the placeholder, which
 * is what should happen while the API is a deploy ahead.
 */
const PACK_KEYS: ReadonlySet<string> = new Set([
  'haircut',
  'haircut-kids',
  'fringe-cut',
  'beard-trim',
  'hair-colour',
  'facial',
  'manicure',
  'pedicure',
  'gel-polish',
  'body-massage',
]);

/**
 * Local placeholders (public/service-photos/, free-license Pexels photos) for a
 * service the pack has no concept for. Generic by category, not by vertical: a
 * garage or a dentist adds its own category names here, with no code branch per
 * business type.
 *
 * These go when the pack covers the category generics — they are the stock
 * photography GRW-560 exists to stop relying on.
 */
const CATEGORY_PLACEHOLDERS: Record<string, string> = {
  Hair: '/service-photos/hair.jpg',
  Skin: '/service-photos/skin.jpg',
  Nails: '/service-photos/nails.jpg',
};

const DEFAULT_PLACEHOLDER = '/service-photos/default.jpg';

/** The pack's picture for a concept, or null when that one has not been made yet. */
export function packPhotoUrl(catalogKey: string | null | undefined): string | null {
  return catalogKey && PACK_KEYS.has(catalogKey) ? `/catalog/${catalogKey}.webp` : null;
}

type PhotoFields = Pick<Service, 'imageUrl' | 'categoryName'> & { catalogKey?: string | null };

/**
 * Is there a real picture of this service — the owner's own, or the pack's?
 *
 * The Services list draws an empty tile rather than a placeholder, so it needs
 * to know the difference between "we have a picture" and "we have a stock
 * photo of somebody else's salon".
 */
export function hasServicePhoto(service: PhotoFields): boolean {
  return Boolean(service.imageUrl) || packPhotoUrl(service.catalogKey) !== null;
}

/** The owner's own upload wins; then the pack; then a per-category placeholder. */
export function servicePhotoUrl(service: PhotoFields): string {
  return (
    service.imageUrl ??
    packPhotoUrl(service.catalogKey) ??
    CATEGORY_PLACEHOLDERS[service.categoryName ?? ''] ??
    DEFAULT_PLACEHOLDER
  );
}
