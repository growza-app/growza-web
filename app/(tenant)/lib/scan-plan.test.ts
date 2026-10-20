import { describe, expect, it } from 'vitest';
import type { Product } from './api-types';
import { planScans } from './scan-plan';

const prod = (id: string, barcode: string, stock: number): Product => ({ id, name: `P-${id}`, barcode, sku: null, stock, priceMinor: '1000' } as unknown as Product);
const shelf = [prod('a', '8901', 2), prod('b', '8902', 5), prod('z', '8900', 0)];
const none = () => 0;

describe('planScans', () => {
  it('adds every code, in order', () => {
    const r = planScans(['8901', '8902', '8901'], shelf, none, 0, 30);
    expect(r.add.map((a) => a.product.id)).toEqual(['a', 'b', 'a']);
    expect(r.problem).toBeNull();
  });

  it('counts a bottle scanned more than the shelf holds only up to the stock', () => {
    const r = planScans(['8901', '8901', '8901'], shelf, none, 0, 30);
    expect(r.add.map((a) => a.product.id)).toEqual(['a', 'a']);
    expect(r.problem).toEqual({ kind: 'stock', name: 'P-a' });
  });

  it('counts what the bill already holds', () => {
    const r = planScans(['8901'], shelf, (id) => (id === 'a' ? 2 : 0), 2, 30);
    expect(r.add).toEqual([]);
    expect(r.problem).toEqual({ kind: 'stock', name: 'P-a' });
  });

  it('skips an unknown code and still adds the rest', () => {
    const r = planScans(['8902', '0000111122', '8902'], shelf, none, 0, 30);
    expect(r.add.map((a) => a.product.id)).toEqual(['b', 'b']);
    expect(r.problem).toEqual({ kind: 'miss', code: '0000111122' });
  });

  it('refuses an out-of-stock product', () => {
    expect(planScans(['8900'], shelf, none, 0, 30)).toEqual({ add: [], problem: { kind: 'stock', name: 'P-z' } });
  });

  it('stops when the bill is full', () => {
    const r = planScans(['8902', '8902', '8902'], shelf, none, 28, 30);
    expect(r.add).toHaveLength(2);
    expect(r.problem).toEqual({ kind: 'full' });
  });

  it('is quiet for nothing to do', () => {
    expect(planScans([], shelf, none, 0, 30)).toEqual({ add: [], problem: null });
  });
});

describe('planScans — a size’s barcode lands on the size (GRW-599)', () => {
  const size = (id: string, option1: string, barcode: string, stock: number) => ({ id, option1, option2: null, priceMinor: null, sku: null, barcode, stock });
  const shirt = { ...prod('shirt', '', 9), name: 'Shirt', sizes: [size('s28', '28', 'SH-28', 0), size('s30', '30', 'SH-30', 2)] } as Product;
  const withShirt = [...shelf, shirt];
  const onBill = (id: string, variantId?: string) => (variantId === 's30' ? 1 : 0);

  it('adds the exact size and skips the grid', () => {
    const r = planScans(['SH-30'], withShirt, none, 0, 30);
    expect(r.add).toHaveLength(1);
    expect(r.add[0]!.size?.id).toBe('s30');
    expect(r.problem).toBeNull();
  });

  it('a size with none left is refused by name, and the rest still go on', () => {
    const r = planScans(['SH-28', '8901'], withShirt, none, 0, 30);
    expect(r.add.map((a) => a.product.id)).toEqual(['a']);
    expect(r.problem).toEqual({ kind: 'stock', name: 'Shirt (28)' });
  });

  it('counts what the bill already holds of that size, and what this batch adds', () => {
    expect(planScans(['SH-30'], withShirt, onBill, 1, 30).add).toHaveLength(1);
    expect(planScans(['SH-30', 'SH-30'], withShirt, onBill, 1, 30).add).toHaveLength(1);
    expect(planScans(['SH-30', 'SH-30'], withShirt, onBill, 1, 30).problem).toEqual({ kind: 'stock', name: 'Shirt (30)' });
  });

  it('a sized product’s own code is handed back whole, with no size, for the till to open its sizes', () => {
    const own = { ...shirt, barcode: 'SHIRT-STYLE' } as Product;
    const r = planScans(['SHIRT-STYLE'], [...shelf, own], none, 0, 30);
    expect(r.add).toHaveLength(1);
    expect(r.add[0]!.size).toBeUndefined();
  });

  it('a plain product beside sized ones is unchanged', () => {
    expect(planScans(['8902'], withShirt, none, 0, 30).add.map((a) => a.product.id)).toEqual(['b']);
  });
});

