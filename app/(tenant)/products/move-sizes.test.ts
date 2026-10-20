import { describe, expect, it } from 'vitest';
import type { Size } from '../lib/api-types';
import { clampQty, labelOf, leftAfter, linesToSend, movableSizes, nothingToMove, totalMoving } from './move-sizes';

const size = (id: string, option1: string, stock: number, extra: Partial<Size> = {}): Size => ({
  id,
  productId: 'p',
  option1,
  option2: null,
  priceMinor: null,
  sku: null,
  barcode: null,
  active: true,
  stock,
  ...extra,
});

describe('moving sizes between branches (GRW-601)', () => {
  const sizes = [size('a', '28', 4), size('b', '30', 11), size('c', '32', 0), size('d', '34', 6, { active: false })];

  it('lists the sizes on sale, in the order the server sent them', () => {
    expect(movableSizes(sizes).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('names a size by its words, with the second option after a slash', () => {
    expect(labelOf(size('x', '30', 1))).toBe('30');
    expect(labelOf(size('x', '30', 1, { option2: 'White' }))).toBe('30 / White');
  });

  it('holds a quantity to what is on the shelf: whole, never negative, never a number the shelf cannot cover', () => {
    const b = sizes[1]!;
    expect(clampQty(b, 6)).toBe(6);
    expect(clampQty(b, 99)).toBe(11);
    expect(clampQty(b, -3)).toBe(0);
    expect(clampQty(b, 2.9)).toBe(2);
    expect(clampQty(b, Number.NaN)).toBe(0);
    expect(clampQty(sizes[2]!, 1)).toBe(0);
    expect(clampQty(size('n', '1', -2), 1)).toBe(0);
  });

  it('says how many are left here after the send', () => {
    expect(leftAfter(sizes[1]!, 6)).toBe(5);
    expect(leftAfter(sizes[1]!, 99)).toBe(0);
    expect(leftAfter(sizes[0]!, 0)).toBe(4);
  });

  it('sends only sizes with something to send; a size off sale or at zero is never sent, whatever the numbers say', () => {
    const lines = linesToSend(sizes, { a: 0, b: 6, c: 3, d: 2, ghost: 5 });
    expect(lines).toEqual([{ variantId: 'b', qty: 6 }]);
    expect(totalMoving(lines)).toBe(6);
    expect(linesToSend(sizes, {})).toEqual([]);
  });

  it('knows when there is nothing to move', () => {
    expect(nothingToMove([size('a', '28', 0), size('b', '30', 0)])).toBe(true);
    expect(nothingToMove([size('a', '28', 0), size('b', '30', 1)])).toBe(false);
    // The only stock is on a size that is off sale: still nothing to move.
    expect(nothingToMove([size('a', '28', 0), size('d', '34', 6, { active: false })])).toBe(true);
    expect(nothingToMove([])).toBe(true);
  });
});
