import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';

/**
 * QA 2026-11-06 — the Top sellers heading read "9 sizes · ₹9,708.50" on a restaurant's menu. A kitchen keeps no count
 * and a dish has no size (`catalog.stock_counted` off), so the totals and the page counter say dishes there. The
 * same switch the Menu and the import already use (`useAreas().stock`). Source-reading: there is no DOM in this suite.
 */
const client = readFileSync(resolve(__dirname, 'SellersClient.tsx'), 'utf8');
const sellers = (m: unknown) => (m as { products: { sellers: Record<string, string> } }).products.sellers;

describe('Top sellers for a kitchen', () => {
  it('says dishes in the totals line and under the list, and sizes only where there are sizes', () => {
    expect(client).toMatch(/counted\s+\? t\('bestTotals', \{ sizes: best\.totals\.sizes, value: money\(best\.totals\.valueMinor\) \}\)\s+: t\('bestTotalsUncounted', \{ dishes: best\.totals\.sizes, value: money\(best\.totals\.valueMinor\) \}\)/);
    expect(client).toMatch(/noun=\{t\(counted \? 'nounSizes' : 'nounDishes'\)\}/);
  });

  it('has the words in both languages, with the count as a plural in English', () => {
    expect(sellers(en).bestTotalsUncounted).toBe('{dishes, plural, one {1 dish} other {# dishes}} · {value}');
    expect(sellers(en).nounDishes).toBe('dishes');
    expect(sellers(hi).bestTotalsUncounted).toContain('{dishes');
    expect(sellers(hi).nounDishes).toBeTruthy();
  });

  it('leaves the shop’s own wording alone', () => {
    expect(sellers(en).bestTotals).toBe('{sizes, plural, one {1 size} other {# sizes}} · {value}');
    expect(sellers(en).nounSizes).toBe('sizes');
  });
});
