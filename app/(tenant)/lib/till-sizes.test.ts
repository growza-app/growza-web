import { describe, expect, it } from 'vitest';
import type { Product, TillSize } from './api-types';
import { canAddSize, colourChoices, groupProductLines, hasSizes, productLineKey, sizeByCode, sizedName, sizeLabel, sizePriceMinor, sizesFor } from './till-sizes';

/**
 * Jira GRW-599 — the till's rules for a product that has sizes.
 */
const size = (id: string, option1: string, o: Partial<TillSize> = {}): TillSize => ({ id, option1, option2: null, priceMinor: null, sku: null, barcode: null, stock: 5, ...o });
const shirt = (sizes: TillSize[], axes = [{ name: 'Size', values: sizes.map((s) => s.option1) }]): Product =>
  ({ id: 'p1', name: 'Half-Sleeve Shirt', priceMinor: '45000', stock: sizes.reduce((n, s) => n + s.stock, 0), optionAxes: axes, variantCount: sizes.length, sizes }) as unknown as Product;

describe('naming and pricing a size', () => {
  it('the bill line is the product with the size in brackets, as the server keeps it', () => {
    expect(sizedName({ name: 'Shirt' }, { option1: '30', option2: null })).toBe('Shirt (30)');
    expect(sizedName({ name: 'Shirt' }, { option1: '30', option2: 'White' })).toBe('Shirt (30 / White)');
    expect(sizeLabel({ option1: '30', option2: 'White' })).toBe('30 / White');
  });

  it('a size sells at its own price, else the product’s', () => {
    expect(sizePriceMinor({ priceMinor: '45000' }, { priceMinor: '52000' })).toBe(52000);
    expect(sizePriceMinor({ priceMinor: '45000' }, { priceMinor: null })).toBe(45000);
  });

  it('the bill key of a plain product is what it always was; a size adds its own id', () => {
    expect(productLineKey('p1')).toBe('p:p1');
    expect(productLineKey('p1', 's30')).toBe('p:p1:s30');
  });
});

describe('FR-04 — a size with none left cannot go on the bill, and never more than there are', () => {
  it('at zero: no; at the last one: yes once; past it: no', () => {
    expect(canAddSize(size('a', '28', { stock: 0 }), 0)).toBe(false);
    expect(canAddSize(size('a', '28', { stock: 2 }), 0)).toBe(true);
    expect(canAddSize(size('a', '28', { stock: 2 }), 1)).toBe(true);
    expect(canAddSize(size('a', '28', { stock: 2 }), 2)).toBe(false);
  });
});

describe('FR-06 — a product with no sizes is not touched', () => {
  it('hasSizes is false without them, and true with', () => {
    expect(hasSizes({ id: 'x', name: 'Oil' } as Product)).toBe(false);
    expect(hasSizes({ id: 'x', name: 'Oil', sizes: [] } as unknown as Product)).toBe(false);
    expect(hasSizes(shirt([size('a', '28')]))).toBe(true);
  });
});

describe('FR-01 — the grid is the owner’s order', () => {
  it('one option: every size, in the order the API sent', () => {
    const p = shirt([size('a', '24'), size('b', '26'), size('c', '28')]);
    expect(sizesFor(p, null).map((s) => s.option1)).toEqual(['24', '26', '28']);
  });

  it('two options: the colour chips are the colours some size uses, in the owner’s order; sizes are those of the chosen colour', () => {
    const p = shirt(
      [size('a', '28', { option2: 'White' }), size('b', '30', { option2: 'White' }), size('c', '28', { option2: 'Sky blue' })],
      [{ name: 'Size', values: ['28', '30'] }, { name: 'Colour', values: ['Red', 'White', 'Sky blue'] }],
    );
    expect(colourChoices(p)).toEqual(['White', 'Sky blue']);
    expect(sizesFor(p, 'White').map((s) => s.option1)).toEqual(['28', '30']);
    expect(sizesFor(p, 'sky BLUE').map((s) => s.option1)).toEqual(['28']);
  });

  it('one option has no colour chips', () => {
    expect(colourChoices(shirt([size('a', '28')]))).toEqual([]);
  });
});

describe('FR-05 — a scan names a size', () => {
  const shelf = [shirt([size('a', '28', { barcode: 'SH-28' }), size('b', '30', { barcode: 'SH-30', sku: 'SHIRT-30' })]), { id: 'oil', name: 'Oil', barcode: 'OIL', sku: null, stock: 3, priceMinor: '100' } as unknown as Product];

  it('by barcode or by SKU, whole, without case', () => {
    expect(sizeByCode(shelf, 'sh-30')?.size.id).toBe('b');
    expect(sizeByCode(shelf, 'shirt-30')?.size.id).toBe('b');
    expect(sizeByCode(shelf, ' SH-28 ')?.product.id).toBe('p1');
  });

  it('a plain product’s code, a partial code and a blank are not a size', () => {
    expect(sizeByCode(shelf, 'OIL')).toBeNull();
    expect(sizeByCode(shelf, 'SH-')).toBeNull();
    expect(sizeByCode(shelf, '  ')).toBeNull();
  });

  it('a code two sizes carry is not guessed at', () => {
    const twice = [shirt([size('a', '28', { barcode: 'DUP' }), size('b', '30', { barcode: 'dup' })])];
    expect(sizeByCode(twice, 'DUP')).toBeNull();
  });
});

describe('what the bill sends (groupProductLines)', () => {
  it('a plain product is one entry with no size key at all, exactly as before', () => {
    const lines = [{ product: { id: 'oil' } }, { product: { id: 'oil' } }];
    expect(groupProductLines(lines, [30000, 30000])).toEqual([{ productId: 'oil', qty: 2, paidMinor: 60000 }]);
  });

  it('two sizes of one shirt are two entries, each with its own size, count and money', () => {
    const lines = [{ product: { id: 'sh', variantId: 's30' } }, { product: { id: 'sh', variantId: 's32' } }, { product: { id: 'sh', variantId: 's30' } }];
    expect(groupProductLines(lines, [45000, 52000, 45000])).toEqual([
      { productId: 'sh', variantId: 's30', qty: 2, paidMinor: 90000 },
      { productId: 'sh', variantId: 's32', qty: 1, paidMinor: 52000 },
    ]);
  });

  it('services and packages are not products and are left out; a mixed bill keeps the order first seen', () => {
    const lines = [{}, { product: { id: 'oil' } }, { product: { id: 'sh', variantId: 's30' } }, {}];
    expect(groupProductLines(lines, [1, 2, 3, 4]).map((p) => p.productId)).toEqual(['oil', 'sh']);
  });

  it('no products, no entries', () => {
    expect(groupProductLines([{}, {}], [1, 2])).toEqual([]);
  });
});
