import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-11-14 (F11) — a category whose every product was retired still drew a chip on the shop's till, and opened
 * onto "No service by that name." The till offers only categories with something to sell, on the phone and the desk,
 * and an empty result is said in the shop's own words.
 */
const flow = readFileSync(new URL('./PayFlow.tsx', import.meta.url), 'utf8');

describe("the till's category chips", () => {
  it('are the categories with something to sell, on both layouts', () => {
    expect(flow).toContain('productCategories.filter((c) => products.some((p) => p.categoryId === c.id))');
    expect(flow.match(/categories=\{sellableCategories\}/g)).toHaveLength(2);
    expect(flow).toContain('{sellableCategories.map((c) => (');
    expect(flow).not.toContain('{productCategories.map((c) => (');
  });

  it('falls back to All when the chosen category empties', () => {
    expect(flow).toContain('if (productsLoaded && !sellableCategories.some((c) => c.id === productCategory)) setProductCategory(ALL_CATEGORIES);');
  });

  it('never says "service" over a shelf', () => {
    expect(flow).not.toContain("t('desk.noProducts') : t('desk.noMatch')");
    expect(flow).toContain("t(counted ? 'desk.noProductMatch' : 'desk.noDishMatch')");
  });
});
