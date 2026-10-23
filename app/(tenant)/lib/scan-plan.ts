import type { Product, TillSize } from './api-types';
import { productByCode } from './product-match';
import { hasSizes, sizeByCode, sizedName } from './till-sizes';

export type ScanProblem = { kind: 'miss'; code: string } | { kind: 'stock'; name: string } | { kind: 'full' };

/** One thing a scan puts on the bill: a product, or — Jira GRW-599 — one size of it (a size's barcode names the size). */
export interface ScanAdd {
  product: Product;
  size?: TillSize;
}

/**
 * What a run of scanned codes does to a bill, worked out before any of it is applied: the bill's own counts are stale
 * inside one batch, so a bottle scanned three times with two on the shelf would otherwise all go on.
 *
 * `onBill` is how many of each product (or of one size of it) the bill holds already; `lineCount` how many lines it
 * has. A code that cannot go on is skipped and the last such problem is reported, so a miss in the middle never stops
 * the rest. A size's barcode lands on the size and skips the grid; a sized product's OWN code has no size to land on,
 * so it is handed back whole and the till opens its sizes.
 *
 * `counted` false (a kitchen: `catalog.stock_counted` off) means there is no shelf to run out of, so a scan is never
 * refused for stock — the bill's line limit and an unknown code are still the two things that can stop one.
 */
export function planScans(
  codes: readonly string[],
  shelf: readonly Product[],
  onBill: (productId: string, variantId?: string) => number,
  lineCount: number,
  maxLines: number,
  counted = true,
): { add: ScanAdd[]; problem: ScanProblem | null } {
  const add: ScanAdd[] = [];
  const extra = new Map<string, number>();
  let problem: ScanProblem | null = null;
  for (const code of codes) {
    const bySize = sizeByCode(shelf, code);
    const hit = bySize ? bySize.product : productByCode(shelf, code);
    if (!hit) {
      problem = { kind: 'miss', code };
      continue;
    }
    if (lineCount + add.length >= maxLines) {
      problem = { kind: 'full' };
      break;
    }
    if (bySize) {
      const { product, size } = bySize;
      const key = `${product.id}|${size.id}`;
      const n = extra.get(key) ?? 0;
      if (counted && (size.stock <= 0 || onBill(product.id, size.id) + n >= size.stock)) {
        problem = { kind: 'stock', name: sizedName(product, size) };
        continue;
      }
      extra.set(key, n + 1);
      add.push({ product, size });
      continue;
    }
    if (hasSizes(hit)) {
      add.push({ product: hit });
      continue;
    }
    const n = extra.get(hit.id) ?? 0;
    if (counted && (hit.stock <= 0 || onBill(hit.id) + n >= hit.stock)) {
      problem = { kind: 'stock', name: hit.name };
      continue;
    }
    extra.set(hit.id, n + 1);
    add.push({ product: hit });
  }
  return { add, problem };
}
