import { describe, expect, it } from 'vitest';
import type { Product } from './api-types';
import { planScans } from './scan-plan';

const prod = (id: string, barcode: string, stock: number): Product => ({ id, name: `P-${id}`, barcode, sku: null, stock, priceMinor: '1000' } as unknown as Product);
const shelf = [prod('a', '8901', 2), prod('b', '8902', 5), prod('z', '8900', 0)];
const none = () => 0;

describe('planScans', () => {
  it('adds every code, in order', () => {
    const r = planScans(['8901', '8902', '8901'], shelf, none, 0, 30);
    expect(r.add.map((p) => p.id)).toEqual(['a', 'b', 'a']);
    expect(r.problem).toBeNull();
  });

  it('counts a bottle scanned more than the shelf holds only up to the stock', () => {
    const r = planScans(['8901', '8901', '8901'], shelf, none, 0, 30);
    expect(r.add.map((p) => p.id)).toEqual(['a', 'a']);
    expect(r.problem).toEqual({ kind: 'stock', name: 'P-a' });
  });

  it('counts what the bill already holds', () => {
    const r = planScans(['8901'], shelf, (id) => (id === 'a' ? 2 : 0), 2, 30);
    expect(r.add).toEqual([]);
    expect(r.problem).toEqual({ kind: 'stock', name: 'P-a' });
  });

  it('skips an unknown code and still adds the rest', () => {
    const r = planScans(['8902', '0000111122', '8902'], shelf, none, 0, 30);
    expect(r.add.map((p) => p.id)).toEqual(['b', 'b']);
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
