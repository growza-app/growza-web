import type { Service } from './api';

/**
 * Lightweight local placeholders (web/public/service-photos/) until real
 * per-service photo upload exists (Supabase Storage — not wired up yet).
 * Generic by category, not by vertical: a car-garage or dentist tenant would
 * just add its own category names here, no code branch per business type.
 */
const CATEGORY_PLACEHOLDERS: Record<string, string> = {
  Hair: '/service-photos/hair.svg',
  Skin: '/service-photos/skin.svg',
  Nails: '/service-photos/nails.svg',
};

const DEFAULT_PLACEHOLDER = '/service-photos/default.svg';

/** A real uploaded photo wins once one exists; until then, falls back to a per-category placeholder. */
export function servicePhotoUrl(service: Pick<Service, 'imageUrl' | 'categoryName'>): string {
  return service.imageUrl ?? CATEGORY_PLACEHOLDERS[service.categoryName ?? ''] ?? DEFAULT_PLACEHOLDER;
}
