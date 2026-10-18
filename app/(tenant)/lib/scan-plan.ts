import type { Product } from './api-types';
import { productByCode } from './product-match';

export type ScanProblem = { kind: 'miss'; code: string } | { kind: 'stock'; name: string } | { kind: 'full' };

/**
 * What a run of scanned codes does to a bill, worked out before any of it is applied: the bill's own counts are stale
 * inside one batch, so a bottle scanned three times with two on the shelf would otherwise all go on.
 *
 * `onBill` is how many of each product the bill holds already; `lineCount` how many lines it has. A code that
 * cannot go on is skipped and the last such problem is reported, so a miss in the middle never stops the rest.
 */
export function planScans(
  codes: readonly string[],
  shelf: readonly Product[],
  onBill: (productId: string) => number,
  lineCount: number,
  maxLines: number,
): { add: Product[]; problem: ScanProblem | null } {
  const add: Product[] = [];
  const extra = new Map<string, number>();
  let problem: ScanProblem | null = null;
  for (const code of codes) {
    const hit = productByCode(shelf, code);
    if (!hit) {
      problem = { kind: 'miss', code };
      continue;
    }
    if (lineCount + add.length >= maxLines) {
      problem = { kind: 'full' };
      break;
    }
    const n = extra.get(hit.id) ?? 0;
    if (hit.stock <= 0 || onBill(hit.id) + n >= hit.stock) {
      problem = { kind: 'stock', name: hit.name };
      continue;
    }
    extra.set(hit.id, n + 1);
    add.push(hit);
  }
  return { add, problem };
}
