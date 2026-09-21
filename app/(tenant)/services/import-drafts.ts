import type { ServiceAdmin, ServiceImportItem } from '../lib/api';

/**
 * One candidate row on its way into the catalogue.
 *
 * Every bulk route — ready-made catalogue, spreadsheet, and (later) the price-list
 * photo — turns its own input into these and hands them to the same review table.
 * That is the design's rule: one confirm step covers every route.
 */
export interface Draft {
  name: string;
  categoryName: string;
  durationMin: string;
  bufferAfterMin: string;
  price: string;
  /** Set when a service of this name already exists — offer a price update, not a second copy. */
  existing: ServiceAdmin | null;
  skip: boolean;
}

/** Why a row cannot be saved yet — a key of `services.problems`, so the screen says it in the owner's language. */
export type DraftProblem = 'priceNotNumber' | 'needsName' | 'needsDuration' | 'tooLong';

/** Why this row cannot be saved yet, or null when it is fine. */
export function problem(d: Draft): DraftProblem | null {
  // A price that is not a number must be caught on every row, duplicate or not:
  // `Number('abc')` is NaN, `JSON.stringify` turns NaN into null, and the import
  // would quietly erase the price it was meant to update.
  if (d.price.trim() && (!Number.isFinite(Number(d.price)) || Number(d.price) < 0)) return 'priceNotNumber';
  if (d.existing) return null; // re-pricing needs nothing else
  if (!d.name.trim()) return 'needsName';
  const dur = Number(d.durationMin);
  if (!d.durationMin.trim() || !Number.isFinite(dur) || dur <= 0) return 'needsDuration';
  if (dur > 12 * 60) return 'tooLong';
  return null;
}

/** Index of what the tenant already lists, so duplicates re-price instead of duplicating. */
export function byNameIndex(existing: ServiceAdmin[]): Map<string, ServiceAdmin> {
  return new Map(existing.map((s) => [s.name.trim().toLowerCase(), s]));
}

export function toImportItems(drafts: Draft[]): ServiceImportItem[] {
  return drafts
    .filter((d) => !d.skip)
    .map((d) =>
      d.existing
        ? {
            mode: 'updatePrice',
            existingId: d.existing.id,
            name: d.existing.name,
            durationMin: d.existing.durationMin,
            priceMinor: d.price.trim() ? Math.round(Number(d.price) * 100) : null,
          }
        : {
            mode: 'create',
            name: d.name.trim(),
            categoryName: d.categoryName.trim() || null,
            durationMin: Number(d.durationMin),
            bufferAfterMin: Number(d.bufferAfterMin) || 0,
            priceMinor: d.price.trim() ? Math.round(Number(d.price) * 100) : null,
          },
    );
}
