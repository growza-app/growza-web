import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 10 Nov 2026 — "the dish's full name is not visible, and it must be for all verticals". A dish, a product or
 * a service is told apart by the words at the END of its name ("Half - 2 pcs", "Full - 6 pcs"), which is exactly
 * what a clamp cuts. Every place a person picks or reads an item by name shows the whole of it.
 */
const css = (f: string) => readFileSync(resolve(__dirname, '../styles', f), 'utf8');
const rule = (sheet: string, sel: string) => {
  const s = css(sheet);
  const at = s.indexOf(`${sel} {`);
  expect(at, `${sel} in ${sheet}`).toBeGreaterThan(-1);
  return s.slice(at, s.indexOf('}', at));
};

describe('an item name is never cut short', () => {
  const names: Array<[string, string]> = [
    ['96-products.css', '.prd-menu-card-name'],
    ['96-products.css', '.prd-name'],
    ['97-services-rebuilt.css', '.svc-name'],
    ['73-pay-flow.css', '.pf-tile-name'],
    ['99-pos.css', '.pf-wide:has(.prd-cat-li) .pf-tile-name'],
    ['99-pos.css', '.pos-bill-item-name'],
    ['14-checkout-sheet.css', '.checkout-service-name'],
    ['10-tables-services-staff-pages.css', '.svc-pick-name'],
    ['79-desk-services.css', '.svc-sheet-name'],
  ];
  for (const [sheet, sel] of names) {
    it(`${sel} wraps to every line it needs`, () => {
      const r = rule(sheet, sel);
      expect(r).not.toMatch(/line-clamp|text-overflow|white-space:\s*nowrap/);
      expect(r).toContain('overflow-wrap: anywhere;');
    });
  }

  it('the Top seller tile shows the dish’s whole name, not "Chicken Biryan…" (QA 10 Nov)', () => {
    expect(rule('96-products.css', '.prd-stat-n.prd-stat-name')).toMatch(/white-space: normal;[\s\S]*overflow-wrap: anywhere;/);
    expect(readFileSync(resolve(__dirname, 'ProductsList.tsx'), 'utf8')).toContain("className={`prd-stat-n${topSeller ? ' prd-stat-name' : ''}`}");
  });

  it('on a Menu card the name has the whole width: Bestseller sits under it, not beside it', () => {
    expect(rule('96-products.css', '.prd-menu-card-title-row')).toContain('flex-direction: column;');
  });
});
