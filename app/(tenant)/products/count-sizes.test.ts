import { describe, expect, it } from 'vitest';
import type { Product, TillSize } from '../lib/api-types';
import { anySizeCounted, anySizeInvalid, changedSizes, countedOf, draftOf, isSizedProduct, readTypedSize, restorable, sizeGap, sizeLines, uncountedOf } from './count-sizes';

const size = (id: string, option1: string, stock: number): TillSize => ({ id, option1, option2: null, priceMinor: null, sku: null, barcode: null, stock });
const style = (id: string, sizes: TillSize[]): Pick<Product, 'id' | 'sizes' | 'optionAxes'> => ({ id, sizes, optionAxes: [{ name: 'Size', values: sizes.map((s) => s.option1) }] });
const plain = (id: string): Pick<Product, 'id' | 'sizes' | 'optionAxes'> => ({ id, optionAxes: [] });

const shirt = style('shirt', [size('a', '28', 4), size('b', '30', 11), size('c', '32', 0)]);

describe('what was typed for a size (GRW-602)', () => {
  it('blank is not counted; a whole number is a count; anything else is invalid', () => {
    expect(readTypedSize(undefined)).toEqual({ kind: 'blank' });
    expect(readTypedSize('   ')).toEqual({ kind: 'blank' });
    expect(readTypedSize('0')).toEqual({ kind: 'count', n: 0 });
    expect(readTypedSize(' 12 ')).toEqual({ kind: 'count', n: 12 });
    for (const bad of ['-1', '1.5', 'x', '1e3', '9999999']) expect(readTypedSize(bad), bad).toEqual({ kind: 'invalid' });
  });

  it('blank is not zero: a blank size has no gap and is not in what is sent', () => {
    expect(sizeGap(shirt.sizes![1]!, '')).toBeNull();
    expect(sizeLines([shirt], { a: '', b: '9' })).toEqual([{ variantId: 'b', count: 9 }]);
  });

  it('counting to zero is a count', () => {
    expect(sizeGap(shirt.sizes![0]!, '0')).toBe(-4);
    expect(sizeLines([shirt], { a: '0' })).toEqual([{ variantId: 'a', count: 0 }]);
  });
});

describe('the gap and the walk', () => {
  it('size 30 recorded as eleven and nine on the shelf is a gap of −2', () => {
    expect(sizeGap(shirt.sizes![1]!, '9')).toBe(-2);
    expect(sizeGap(shirt.sizes![1]!, '11')).toBe(0);
    expect(sizeGap(shirt.sizes![1]!, '14')).toBe(3);
  });

  it('says how many sizes are still to count and how many are counted', () => {
    expect(uncountedOf(shirt, {})).toBe(3);
    expect(uncountedOf(shirt, { a: '4', b: '' })).toBe(2);
    expect(countedOf(shirt, { a: '4', c: '0' })).toBe(2);
  });

  it('counts the changes Save will make: sizes whose number differs, not those counted the same', () => {
    expect(changedSizes([shirt], { a: '4', b: '9', c: '1' })).toBe(2);
    expect(changedSizes([shirt], { a: '4' })).toBe(0);
  });

  it('sees an invalid size and something counted', () => {
    expect(anySizeInvalid([shirt], { a: 'x' })).toBe(true);
    expect(anySizeInvalid([shirt], { a: '3' })).toBe(false);
    expect(anySizeCounted([shirt], {})).toBe(false);
    expect(anySizeCounted([shirt], { c: '0' })).toBe(true);
    expect(anySizeCounted([shirt], { a: 'x' })).toBe(true);
  });

  it('a product with no sizes is not sized: it is counted as one number as it always was', () => {
    expect(isSizedProduct(shirt)).toBe(true);
    expect(isSizedProduct(plain('oil'))).toBe(false);
    expect(sizeLines([plain('oil')], { oil: '5' })).toEqual([]);
  });
});

describe('the draft', () => {
  it('keeps the typed text of the products somebody counted and every size with something in it — never a blank', () => {
    const d = draftOf({ oil: '7', mug: '2' }, new Set(['oil']), { a: '3', b: '', c: ' ' });
    expect(d).toEqual({ products: { oil: '7' }, sizes: { a: '3' } });
  });

  it('comes back as it was typed, and drops what has since left the shelf', () => {
    const back = restorable({ products: { oil: '7', gone: '1' }, sizes: { a: '3', old: '9' } }, [shirt, plain('oil')]);
    expect(back).toEqual({ products: { oil: '7' }, sizes: { a: '3' } });
  });

  it('a size typed against a plain product (or the reverse) is not restored', () => {
    expect(restorable({ products: { shirt: '5' }, sizes: {} }, [shirt])).toEqual({ products: {}, sizes: {} });
  });
});
