import type { Product, SizeAxis, TillSize } from './api-types';

/**
 * Jira GRW-599 — what the till does with a product that has sizes, as plain functions.
 *
 * The rules the shopkeeper meets: tapping a shirt opens its sizes (never a dropdown), a size is added at quantity one,
 * a size with none left is shown but cannot go on the bill (the same rule a plain product has at this till), and a
 * size's count caps how many can be added. The bill's line carries the size so the server takes the unit off the right
 * count, and the name carries it so the receipt and the history say which.
 */

/** "30 / White" — what a bill line and a message call a size. */
export const sizeLabel = (s: Pick<TillSize, 'option1' | 'option2'>): string => (s.option2 ? `${s.option1} / ${s.option2}` : s.option1);

/** The bill line's name: the product's, with the size in brackets — the same copy the server keeps on the bill. */
export const sizedName = (p: Pick<Product, 'name'>, s: Pick<TillSize, 'option1' | 'option2'>): string => `${p.name} (${sizeLabel(s)})`;

/** What a size sells for: its own price, else the product's. */
export const sizePriceMinor = (p: Pick<Product, 'priceMinor'>, s: Pick<TillSize, 'priceMinor'>): number => Number(s.priceMinor ?? p.priceMinor ?? 0);

/** A product whose sizes the till holds: tapping it opens its sizes. */
export const hasSizes = (p: Product): boolean => (p.sizes?.length ?? 0) > 0;

/** The bill's key for a line: a plain product's is `p:<id>` as ever; a size adds its own id. */
export const productLineKey = (productId: string, variantId?: string): string => (variantId ? `p:${productId}:${variantId}` : `p:${productId}`);

/** The second option's values that some size actually uses, in the owner's order — the colour chips. Empty for one option. */
export function colourChoices(p: Product): string[] {
  const second = (p.optionAxes ?? [])[1];
  if (!second) return [];
  const used = new Set((p.sizes ?? []).map((s) => (s.option2 ?? '').toLowerCase()));
  return second.values.filter((v) => used.has(v.toLowerCase()));
}

/** The sizes to show for one colour (or all of them, with one option), in the owner's order — the API sends them so. */
export function sizesFor(p: Product, colour: string | null): TillSize[] {
  return (p.sizes ?? []).filter((s) => colour === null || (s.option2 ?? '').toLowerCase() === colour.toLowerCase());
}

/** Can one more of this size go on the bill? Not when none are left, and never more than there are. */
export const canAddSize = (s: TillSize, onBill: number): boolean => s.stock > 0 && onBill < s.stock;

/**
 * The size a scanned code names, across the whole shelf: its barcode or SKU, whole, without regard to case. Null for
 * none — and for more than one, which the shelf's own rule (one code, one thing at a branch) should make impossible,
 * so the till refuses to guess if it ever happens.
 */
export function sizeByCode(shelf: readonly Product[], typed: string): { product: Product; size: TillSize } | null {
  const code = typed.trim().toLowerCase();
  if (code === '') return null;
  const hits: Array<{ product: Product; size: TillSize }> = [];
  for (const product of shelf) {
    for (const size of product.sizes ?? []) {
      if ((size.barcode ?? '').toLowerCase() === code || (size.sku ?? '').toLowerCase() === code) hits.push({ product, size });
    }
  }
  return hits.length === 1 ? hits[0]! : null;
}

/** A product line as the counter-sale route takes it: which product, and which size of it when it has sizes. */
export interface SoldProduct {
  productId: string;
  variantId?: string;
  qty: number;
  paidMinor: number;
}

/**
 * The bill's product lines (one per unit) grouped for the route: one entry per product, and per SIZE of a product that
 * has sizes — the size is what the server takes the unit from, so two sizes of one shirt are two entries, never one.
 * `amounts[i]` is what line i came to.
 */
export function groupProductLines(lines: ReadonlyArray<{ product?: { id: string; variantId?: string } }>, amounts: readonly number[]): SoldProduct[] {
  const sold = new Map<string, SoldProduct>();
  lines.forEach((l, i) => {
    if (!l.product) return;
    const key = productLineKey(l.product.id, l.product.variantId);
    const at = sold.get(key) ?? { productId: l.product.id, ...(l.product.variantId ? { variantId: l.product.variantId } : {}), qty: 0, paidMinor: 0 };
    at.qty += 1;
    at.paidMinor += amounts[i] ?? 0;
    sold.set(key, at);
  });
  return [...sold.values()];
}

/** The option's own name, for a chip row's label ("Colour"). */
export const secondAxisName = (p: Product): string => (p.optionAxes ?? [])[1]?.name ?? '';

/** Re-export the axis type so a caller needs one import. */
export type { SizeAxis };
