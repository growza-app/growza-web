import type { Product, TillSize } from '../lib/api-types';

/**
 * Jira GRW-602 — what a stock take decides about sizes, apart from drawing it.
 *
 * A product with sizes is counted size by size; one with none is counted as one number, exactly as it always was. A size
 * the owner has not typed anything into is NOT counted and is NOT changed — blank is not zero (BR-03). What has been
 * typed is kept as text, so "1" on its way to "12" is never rounded or refused mid-keystroke.
 */

/** The product has sizes: its count lives on them, and the style has no number of its own to type. */
export const isSizedProduct = (p: Pick<Product, 'optionAxes'>): boolean => (p.optionAxes?.length ?? 0) > 0;

export const sizesOf = (p: Pick<Product, 'sizes'>): readonly TillSize[] => p.sizes ?? [];

/** What was typed for one size: `blank` (not counted), `invalid`, or the number. */
export type TypedSize = { kind: 'blank' } | { kind: 'invalid' } | { kind: 'count'; n: number };

export function readTypedSize(raw: string | undefined): TypedSize {
  if (raw === undefined || raw.trim() === '') return { kind: 'blank' };
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return { kind: 'invalid' };
  const n = Number(t);
  return Number.isSafeInteger(n) && n <= 1_000_000 ? { kind: 'count', n } : { kind: 'invalid' };
}

/** How far the count is from what was recorded: null for a size not counted (or not a number yet). */
export function sizeGap(size: Pick<TillSize, 'stock'>, raw: string | undefined): number | null {
  const typed = readTypedSize(raw);
  return typed.kind === 'count' ? typed.n - size.stock : null;
}

/** Sizes of this product with nothing typed — the number the owner still has to walk. */
export const uncountedOf = (p: Pick<Product, 'sizes'>, typed: Readonly<Record<string, string>>): number => sizesOf(p).filter((s) => readTypedSize(typed[s.id]).kind === 'blank').length;

/** Sizes of this product the owner has put a number (or something) into. */
export const countedOf = (p: Pick<Product, 'sizes'>, typed: Readonly<Record<string, string>>): number => sizesOf(p).length - uncountedOf(p, typed);

/** Every typed size in the shelf that is not a number, so Save can say so before the server does. */
export const anySizeInvalid = (shelf: readonly Pick<Product, 'sizes'>[], typed: Readonly<Record<string, string>>): boolean =>
  shelf.some((p) => sizesOf(p).some((s) => readTypedSize(typed[s.id]).kind === 'invalid'));

/** The sizes whose counted number differs from the recorded one: the changes Save will make. */
export function changedSizes(shelf: readonly Pick<Product, 'sizes'>[], typed: Readonly<Record<string, string>>): number {
  let n = 0;
  for (const p of shelf) for (const s of sizesOf(p)) if ((sizeGap(s, typed[s.id]) ?? 0) !== 0) n++;
  return n;
}

/** The lines the server takes: only sizes with a number typed, whole. */
export function sizeLines(shelf: readonly Pick<Product, 'sizes'>[], typed: Readonly<Record<string, string>>): Array<{ variantId: string; count: number }> {
  const out: Array<{ variantId: string; count: number }> = [];
  for (const p of shelf) {
    for (const s of sizesOf(p)) {
      const t = readTypedSize(typed[s.id]);
      if (t.kind === 'count') out.push({ variantId: s.id, count: t.n });
    }
  }
  return out;
}

/** Any size with a number typed — "something has been counted" for the Save button. */
export const anySizeCounted = (shelf: readonly Pick<Product, 'sizes'>[], typed: Readonly<Record<string, string>>): boolean =>
  shelf.some((p) => sizesOf(p).some((s) => readTypedSize(typed[s.id]).kind !== 'blank'));

/**
 * What goes to the server as the draft: the typed text of the products somebody counted and of every size with
 * anything in it. Blank entries are left out, so a cleared box is a size not counted.
 */
export function draftOf(typedProducts: Readonly<Record<string, string>>, touched: ReadonlySet<string>, typedSizes: Readonly<Record<string, string>>): { products: Record<string, string>; sizes: Record<string, string> } {
  const products: Record<string, string> = {};
  for (const id of touched) if (typedProducts[id] !== undefined) products[id] = typedProducts[id]!;
  const sizes: Record<string, string> = {};
  for (const [id, raw] of Object.entries(typedSizes)) if (raw.trim() !== '') sizes[id] = raw;
  return { products, sizes };
}

/** A draft worth restoring: only what still belongs to this shelf — a product or size removed since is dropped. */
export function restorable(
  draft: { products: Readonly<Record<string, string>>; sizes: Readonly<Record<string, string>> },
  shelf: readonly Pick<Product, 'id' | 'sizes' | 'optionAxes'>[],
): { products: Record<string, string>; sizes: Record<string, string> } {
  const products: Record<string, string> = {};
  const sizes: Record<string, string> = {};
  const sizeIds = new Set<string>();
  for (const p of shelf) {
    if (isSizedProduct(p)) for (const s of sizesOf(p)) sizeIds.add(s.id);
    else if (draft.products[p.id] !== undefined) products[p.id] = draft.products[p.id]!;
  }
  for (const [id, raw] of Object.entries(draft.sizes)) if (sizeIds.has(id)) sizes[id] = raw;
  return { products, sizes };
}
