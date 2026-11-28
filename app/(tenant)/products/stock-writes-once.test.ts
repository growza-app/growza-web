import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Product } from '../lib/api-types';
import { ApiError } from '../lib/api';
import { isStockRepeat, newRequestKey } from '../lib/request-key';
import { buildDrafts, reviewProblems, SAMPLE_SIZES_CSV, suggest, toItems } from './product-import';

/**
 * Retail hardening 2026-11-28 — "Receive 8" tapped again after a lost answer put 16 on the shelf, and a delivery file
 * could not add stock to a product with sizes at all. One request id per action, kept across its retries; and a Size
 * column, one row per size.
 */
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');

const shirt: Product = {
  id: 'shirt',
  name: 'School Shirt',
  priceMinor: '45000',
  currency: 'INR',
  stock: 30,
  imageUrl: null,
  active: true,
  locationId: 'loc',
  sold: 0,
  costMinor: null,
  lowStockAt: 0,
  categoryId: null,
  categoryName: null,
  sku: null,
  barcode: null,
  gstRateBp: null,
  hsn: null,
  optionAxes: [{ name: 'Size', values: ['30', '32', '34'] }],
  variantCount: 3,
};
const belt: Product = { ...shirt, id: 'belt', name: 'School Belt', stock: 10, optionAxes: [], variantCount: 0 };

const rowsOf = (csv: string) => csv.trim().split('\n').map((l) => l.split(','));

describe('a request id per stock action', () => {
  it('is a uuid, new each time', () => {
    const a = newRequestKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(newRequestKey()).not.toBe(a);
  });

  it('knows the API’s "already saved" and "still saving", and nothing else', () => {
    expect(isStockRepeat(new ApiError(409, 'x', 'x', undefined, undefined, { code: 'already_saved' }))).toBe(true);
    expect(isStockRepeat(new ApiError(409, 'x', 'x', undefined, undefined, { code: 'in_progress' }))).toBe(true);
    expect(isStockRepeat(new ApiError(409, 'Not enough stock', 'Not enough stock'))).toBe(false);
    expect(isStockRepeat(new Error('network'))).toBe(false);
  });

  it('the stock sheet, the sizes move and the file review each send one, kept until the action is done', () => {
    for (const f of ['StockPanel.tsx', 'MoveSizesSheet.tsx', 'ImportProductReview.tsx']) {
      const src = read(f);
      expect(src, f).toContain('requestKey.current ??= newRequestKey()');
      expect(src, f).toContain('requestKey.current = null');
      expect(src, f).toContain('isStockRepeat(err)');
    }
    expect(read('StockPanel.tsx')).toMatch(/transferProduct\(product\.id, \{[^}]*idempotencyKey,/s);
    expect(read('StockPanel.tsx')).toContain('qty: n, note: note.trim() || undefined, idempotencyKey }');
    expect(read('MoveSizesSheet.tsx')).toContain('idempotencyKey: requestKey.current');
    expect(read('ImportProductReview.tsx')).toContain('toItems(rows, adding), requestKey.current');
  });
});

describe('a delivery file for products with sizes', () => {
  const [headers, ...body] = rowsOf(SAMPLE_SIZES_CSV);
  const map = suggest(headers!);

  it('reads a Size column', () => {
    expect(headers![map.size]).toBe('Size');
    expect(headers![map.stock]).toBe('Stock');
  });

  it('one row per size: each adds to its size and nothing else', () => {
    const drafts = buildDrafts(body, map, [shirt]);
    expect(drafts.map((d) => d.skip)).toEqual([false, false, false]);
    expect(reviewProblems(drafts, [shirt], true)).toEqual([null, null, null]);
    expect(toItems(drafts, true)).toEqual([
      { mode: 'update', row: 1, existingId: 'shirt', size: '30', addStock: 10 },
      { mode: 'update', row: 2, existingId: 'shirt', size: '32', addStock: 12 },
      { mode: 'update', row: 3, existingId: 'shirt', size: '34', addStock: 8 },
    ]);
  });

  it('a price on a size row is not sent: the product’s other rows could each say another', () => {
    const m = suggest(['Product name', 'Size', 'Price', 'Stock']);
    const drafts = buildDrafts([['School Shirt', '30', '499', '5']], m, [shirt]);
    expect(toItems(drafts, true)).toEqual([{ mode: 'update', row: 1, existingId: 'shirt', size: '30', addStock: 5 }]);
  });

  it('the same size twice is a repeat; "32/White" and "32 / white" are one size', () => {
    const drafts = buildDrafts([['School Shirt', '32/White', '', '4'], ['School Shirt', '32 / white', '', '4']], suggest(['Product name', 'Size', 'Price', 'Stock']), [shirt]);
    expect(drafts[1]!.skip).toBe(true);
    expect(drafts[1]!.skipReason).toBe('repeat');
  });

  it('says what to fix: no size for a product with sizes, a size for one without, a size on a new product', () => {
    const m = suggest(['Product name', 'Size', 'Price', 'Stock']);
    const drafts = buildDrafts([['School Shirt', '', '', '5'], ['School Belt', '30', '', '5'], ['School Skirt', '30', '480', '5']], m, [shirt, belt]);
    expect(reviewProblems(drafts, [shirt, belt], true)).toEqual(['needsSize', 'notSized', 'sizeNewProduct']);
  });

  it('a product with sizes and no Size column still takes its price', () => {
    const m = suggest(['Product name', 'Price']);
    const drafts = buildDrafts([['School Shirt', '499']], m, [shirt]);
    expect(reviewProblems(drafts, [shirt], false)).toEqual([null]);
    expect(toItems(drafts, false)).toEqual([{ mode: 'update', row: 1, existingId: 'shirt', priceMinor: 49900 }]);
  });
});
