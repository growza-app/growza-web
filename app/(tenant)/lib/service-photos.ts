import type { Service } from './api';

/**
 * Local placeholders (web/public/service-photos/, free-license Pexels
 * photos) shown until an owner uploads a real photo for that service
 * (Services page — local disk today, S3-ready). Generic by
 * category, not by vertical: a car-garage or dentist tenant would just add
 * its own category names here, no code branch per business type.
 */
const CATEGORY_PLACEHOLDERS: Record<string, string> = {
  Hair: '/service-photos/hair.jpg',
  Skin: '/service-photos/skin.jpg',
  Nails: '/service-photos/nails.jpg',
};

const DEFAULT_PLACEHOLDER = '/service-photos/default.jpg';

/** A real uploaded photo wins once one exists; until then, falls back to a per-category placeholder. */
export function servicePhotoUrl(service: Pick<Service, 'imageUrl' | 'categoryName'>): string {
  return service.imageUrl ?? CATEGORY_PLACEHOLDERS[service.categoryName ?? ''] ?? DEFAULT_PLACEHOLDER;
}
