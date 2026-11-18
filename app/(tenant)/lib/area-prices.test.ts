import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { areaUnitMinor, changeWords, hasAreaPrices, withAreaPrices } from './area-prices';
import type { Product } from './api-types';

/** Jira GRW-734 — the till shows a table's dishes at its area's price, the same rule the server prices the round with. */
const dish = (id: string, priceMinor: number, sizes?: Array<{ id: string; priceMinor: string | null }>): Product =>
  ({ id, name: id, priceMinor: String(priceMinor), sizes: sizes?.map((s) => ({ ...s, option1: s.id, option2: null, sku: null, barcode: null, stock: 0 })) }) as unknown as Product;

describe('the area price, to the whole rupee (BR-03)', () => {
  it('matches the server: +10% of ₹240 is ₹264, of ₹99 is ₹109, -5% of ₹30 is ₹29; a fixed price wins; no rule leaves paise alone', () => {
    expect(areaUnitMinor(24_000, 1000)).toBe(26_400);
    expect(areaUnitMinor(9_900, 1000)).toBe(10_900);
    expect(areaUnitMinor(3_000, -500)).toBe(2_900);
    expect(areaUnitMinor(3_000, 1000, 5_000)).toBe(5_000);
    expect(areaUnitMinor(9_950, null)).toBe(9_950);
  });

  it('a table in an area prices each dish and each size; a sized dish takes no fixed price; no rule is the menu itself', () => {
    const menu = [dish('tikka', 24_000), dish('drink', 3_000), dish('lassi', 8_000, [{ id: 'S', priceMinor: null }, { id: 'L', priceMinor: '12000' }])];
    const ac = withAreaPrices(menu, { changeBp: 1000, fixed: { drink: 5_000, lassi: 1_000 } });
    expect(ac.map((p) => p.priceMinor)).toEqual(['26400', '5000', '8800']);
    expect(ac[2]!.sizes!.map((s) => s.priceMinor)).toEqual([null, '13200']);
    expect(withAreaPrices(menu, { changeBp: null, fixed: {} })).toBe(menu);
    expect(withAreaPrices(menu, undefined)).toBe(menu);
    expect(hasAreaPrices({ changeBp: null, fixed: { drink: 5_000 } })).toBe(true);
    expect(changeWords(1000)).toBe('+10%');
    expect(changeWords(-500)).toBe('−5%');
    expect(changeWords(1250)).toBe('+12.5%');
  });

  it('the till uses the area’s prices only at a table: PayFlow derives its menu from the table’s area', () => {
    const src = readFileSync(path.resolve('app/(tenant)/appointments/new/PayFlow.tsx'), 'utf8');
    expect(src).toContain('withAreaPrices(menuProducts, atTable?.pricing)');
  });
});
