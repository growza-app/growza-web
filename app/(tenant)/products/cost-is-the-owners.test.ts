import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shelfSeesCost } from './ProductsList';

/**
 * QA 2026-11-14 — the product form says the cost is "Only you see this", and the desk's Stock screen offered a
 * "Bought for" sort over costs it was sent. The API now leaves `costMinor` out for whoever cannot see the sales;
 * the screen reads that absence and draws no cost sort, no cost column and no cost field.
 */
const list = readFileSync(new URL('./ProductsList.tsx', import.meta.url), 'utf8');
const sheet = readFileSync(new URL('./ProductSheet.tsx', import.meta.url), 'utf8');

describe('what a product cost is shown only to whoever is sent it', () => {
  it('reads the answer from the rows: a key that is there (even null) means yes, none means no', () => {
    expect(shelfSeesCost([{ id: 'a', costMinor: '88500' }])).toBe(true);
    expect(shelfSeesCost([{ id: 'a', costMinor: null }, { id: 'b' }])).toBe(true);
    expect(shelfSeesCost([{ id: 'a' }, { id: 'b' }])).toBe(false);
    // An empty shelf: nothing to hide, and the owner adding the first product needs the field.
    expect(shelfSeesCost([])).toBe(true);
  });

  it('the sort, the desk column and the form follow it', () => {
    expect(list).toContain(".filter((s) => seesCost || s !== 'cost')");
    expect(list).toContain('{seesCost ? <SortableTh col="cost"');
    expect(list).toContain('seesCost={seesCost}');
    expect(sheet).toContain("{seesCost ? (\n                  <div className=\"prd-field\">\n                    <label className=\"prd-field-label\" htmlFor=\"prd-cost\">");
    // The form sends no cost it never showed, and does not promise "Only you see this" to somebody else.
    expect(sheet).toContain('...(seesCost ? { costMinor:');
    expect(sheet).toContain(") : seesCost ? (\n                <div className=\"sheet-foot\">{t('costHint')}</div>");
  });
});
