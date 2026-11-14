import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Product } from '../lib/api';
import { filterShelf, searchKeepsBestFirst, sortShelf } from './ProductsList';

/**
 * QA 2026-11-14 (F15) — on the sports shop's Stock screen "QA4 Cricket" listed ten products A–Z, the one asked for
 * eighth (Batting Gloves first, because its category is Cricket). The search ranks; the default A–Z threw it away.
 */
const p = (name: string, categoryName: string | null): Product =>
  ({ id: name, name, categoryName, categoryId: categoryName, priceMinor: '49900', stock: 5, lowStockAt: 2, active: true, sold: 0, sizes: [] }) as unknown as Product;
const shelf = [
  p('Batting Gloves', 'Cricket'),
  p('Batting Pads', 'Cricket'),
  p('Cricket Ball', 'Cricket'),
  p('Cricket Bat English Willow', 'Cricket'),
  p('QA4 Cricket Cap', 'QA4 Caps'),
  p('Football', 'Football'),
];

describe('a search on the shelf', () => {
  it('puts the product named by every word first while nobody has picked a sort', () => {
    expect(searchKeepsBestFirst('QA4 Cricket', 'name', 'asc')).toBe(true);
    const found = filterShelf(shelf, 'all', 'QA4 Cricket');
    expect(found[0]?.name).toBe('QA4 Cricket Cap');
  });

  it('a sort the owner picks still wins, and no search keeps A–Z', () => {
    expect(searchKeepsBestFirst('QA4 Cricket', 'price', 'desc')).toBe(false);
    expect(searchKeepsBestFirst('QA4 Cricket', 'name', 'desc')).toBe(false);
    expect(searchKeepsBestFirst('', 'name', 'asc')).toBe(false);
    expect(searchKeepsBestFirst('Q', 'name', 'asc')).toBe(false);
    expect(sortShelf(filterShelf(shelf, 'all', ''), 'name')[0]?.name).toBe('Batting Gloves');
  });

  it('the screen uses it, and Edit products searches the same way', () => {
    const list = readFileSync(new URL('./ProductsList.tsx', import.meta.url), 'utf8');
    const bulk = readFileSync(new URL('./BulkEditProductsModal.tsx', import.meta.url), 'utf8');
    expect(list).toContain('return searchKeepsBestFirst(search, sort, sortDir) ? found : sortShelf(found, sort, sortDir);');
    expect(bulk).toContain('return matchItems(');
    expect(bulk).toContain('const m = productMatchable(p);');
    expect(bulk).not.toContain(".toLowerCase().includes(q)");
  });
});
