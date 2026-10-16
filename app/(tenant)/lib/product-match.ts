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
  codes: [p.barcode, p.sku],
});

/**
 * The product a scan or a typed code names exactly, for Enter at the till. Null for none or for more than one.
 *
 * The caller passes the whole shelf, not the in-stock view: a count may be below zero on purpose (the bottle in the
 * hand is the truth), so a scanned bottle is sold even when the screen thought there were none.
 */
export const productByCode = (products: readonly Product[], typed: string): Product | null => exactCode(products.map(productMatchable), typed);
