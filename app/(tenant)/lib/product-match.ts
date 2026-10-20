import { ApiError } from './api';
import type { Product } from './api-types';
import { asMinor, exactCode, type Matchable } from './service-match';

/**
 * Jira GRW-574 — what a product is found by, wherever the shelf is searched (the Products screen, the desk till's
 * Products tab, the phone till's sheet): its name and category by spelling, its price exactly, and its barcode and
 * SKU whole or from their start. One place, so the three searches never disagree about what a code finds.
 */
export const productMatchable = (p: Product): Matchable<Product> => ({
  item: p,
  text: [p.name, p.categoryName ?? ''],
  priceMinor: asMinor(p.priceMinor),
  // Jira GRW-599 — a size's own codes find its product too (the till then opens its sizes).
  codes: [p.barcode, p.sku, ...(p.sizes ?? []).flatMap((s) => [s.barcode, s.sku])],
});

/**
 * The product a scan or a typed code names exactly, for Enter at the till. Null for none or for more than one.
 *
 * The caller passes the whole shelf, not the in-stock view: a count may be below zero on purpose (the bottle in the
 * hand is the truth), so a scanned bottle is sold even when the screen thought there were none.
 */
export const productByCode = (products: readonly Product[], typed: string): Product | null => exactCode(products.map(productMatchable), typed);

/**
 * Jira GRW-574 — a 409 for a SKU or barcode another product at the branch holds (or took back when it was brought
 * back from retired). The API names that product in `existing`; the sheet says its name in the page's language.
 */
export function codeHolder(err: unknown): { field: 'sku' | 'barcode'; name: string } | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body as { field?: unknown; existing?: { name?: unknown } } | null | undefined;
  const field = body?.field;
  const name = body?.existing?.name;
  return (field === 'sku' || field === 'barcode') && typeof name === 'string' ? { field, name } : null;
}
