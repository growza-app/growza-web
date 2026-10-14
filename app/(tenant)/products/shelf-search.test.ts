import { describe, expect, it } from 'vitest';
import { filterShelf } from './ProductsList';
import type { Product } from '../lib/api-types';

const p = (name: string, stock = 5, active = true): Product => ({ id: name, name, priceMinor: '45000', currency: 'INR', stock, imageUrl: null, active, locationId: 'b', sold: 0, costMinor: null, lowStockAt: 0 });
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
