import { describe, expect, it } from 'vitest';
import { filterShelf } from './ProductsList';
import type { Product } from '../lib/api-types';

const p = (name: string, stock = 5, active = true, codes: { sku?: string; barcode?: string } = {}): Product => ({
  id: name,
  name,
  priceMinor: '45000',
  currency: 'INR',
  stock,
  imageUrl: null,
  active,
  locationId: 'b',
  sold: 0,
  costMinor: null,
  lowStockAt: 0,
  categoryId: null,
  categoryName: null,
  sku: codes.sku ?? null,
  barcode: codes.barcode ?? null,
  gstRateBp: null,
  hsn: null,
});
const shelf = [p('Keratin Shampoo'), p('Argan Oil'), p('Old Serum', 1, false)];

describe('the Products screen finds a product however it is spelled (GRW-375 matcher)', () => {
  it('"shampo" finds Keratin Shampoo; "argon" finds Argan Oil', () => {
    expect(filterShelf(shelf, 'all', 'shampo').map((x) => x.name)).toEqual(['Keratin Shampoo']);
    expect(filterShelf(shelf, 'all', 'argon').map((x) => x.name)).toEqual(['Argan Oil']);
  });
  it('one letter is not a search yet: the whole shelf stays', () => {
    expect(filterShelf(shelf, 'all', 's').length).toBe(2);
    expect(filterShelf(shelf, 'all', 'sh').map((x) => x.name)).toEqual(['Keratin Shampoo']);
  });
  it('the chip narrows first: a retired product is found only under Retired', () => {
    expect(filterShelf(shelf, 'all', 'serum')).toEqual([]);
    expect(filterShelf(shelf, 'retired', 'serum').map((x) => x.name)).toEqual(['Old Serum']);
  });
});

describe('Jira GRW-574 — the Products screen finds a product by its SKU or barcode', () => {
  const coded = [
    p('Argan Oil', 5, true, { sku: 'ARG-100', barcode: '8901234567890' }),
    p('Argan Mask', 5, true, { sku: 'ARG-200', barcode: '8901234567891' }),
    p('Keratin Shampoo', 5, true, { sku: 'KER-1' }),
  ];
  it('AC-01: typing ARG-100 finds Argan Oil, in any letters, and ranks it first', () => {
    expect(filterShelf(coded, 'all', 'ARG-100')[0]!.name).toBe('Argan Oil');
    expect(filterShelf(coded, 'all', 'arg-100').map((x) => x.name)).toEqual(['Argan Oil']);
  });
  it('a code typed from its start lists every product it could be', () => {
    expect(filterShelf(coded, 'all', 'arg-').map((x) => x.name).sort()).toEqual(['Argan Mask', 'Argan Oil']);
  });
  it('a whole barcode finds only its own product, never a neighbour one digit off, and "89"/"890" does not match every Indian barcode', () => {
    expect(filterShelf(coded, 'all', '8901234567890').map((x) => x.name)).toEqual(['Argan Oil']);
    expect(filterShelf(coded, 'all', '89')).toEqual([]);
    expect(filterShelf(coded, 'all', '890')).toEqual([]);
  });
  it('a product with no codes is still found by name', () => {
    expect(filterShelf(coded, 'all', 'keratin').map((x) => x.name)).toEqual(['Keratin Shampoo']);
  });
});
