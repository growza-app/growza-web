import type { Size } from '../lib/api-types';

/**
 * Jira GRW-601 — what the "move sizes to another branch" sheet decides, apart from drawing it.
 *
 * A size can only go as far as it has: the count is capped at what is on this shelf (the server holds the same floor).
 * A size that is off sale, or at zero, has nothing to send and is shown dimmed. Quantities are kept per size id so
 * they survive a failed send — the owner's numbers are never thrown away by an error.
 */

/** The sizes worth listing: on sale, in the owner's order (the server sends them that way). */
export const movableSizes = (sizes: readonly Size[]): Size[] => sizes.filter((s) => s.active);

export const labelOf = (s: Pick<Size, 'option1' | 'option2'>): string => (s.option2 ? `${s.option1} / ${s.option2}` : s.option1);

/** A quantity held to what this shelf has, whole, never below zero. */
export const clampQty = (s: Pick<Size, 'stock'>, n: number): number => Math.max(0, Math.min(Math.max(s.stock, 0), Math.trunc(Number.isFinite(n) ? n : 0)));

/** Every size at zero (or none on sale): there is nothing to send. */
export const nothingToMove = (sizes: readonly Size[]): boolean => movableSizes(sizes).every((s) => s.stock <= 0);

/** The count that would be left here once this goes. */
export const leftAfter = (s: Pick<Size, 'stock'>, qty: number): number => Math.max(s.stock, 0) - clampQty(s, qty);

/** The lines the server takes: only sizes with something to send, quantities held to the shelf. */
export function linesToSend(sizes: readonly Size[], qtys: Readonly<Record<string, number>>): Array<{ variantId: string; qty: number }> {
  const out: Array<{ variantId: string; qty: number }> = [];
  for (const s of movableSizes(sizes)) {
    const qty = clampQty(s, qtys[s.id] ?? 0);
    if (qty > 0) out.push({ variantId: s.id, qty });
  }
  return out;
}

export const totalMoving = (lines: ReadonlyArray<{ qty: number }>): number => lines.reduce((n, l) => n + l.qty, 0);
