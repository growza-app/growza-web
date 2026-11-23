import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Product, RecipeCostDish } from '../lib/api-types';
import { groupBySection, groupedOrder, needsRecipe, recipeInfoOf, recipeStateOf, recipeStates } from './menu-manager';

const dish = (id: string, categoryId: string | null, extra: Partial<Product> = {}): Product =>
  ({ id, name: id, categoryId, categoryName: null, active: true, priceMinor: 100, sold: 0, stock: 0, lowStockAt: 0, ...extra }) as unknown as Product;
const size = (noRecipe: boolean, foodCostPct?: number | null) => ({ variantId: null, label: null, priceMinor: 100, noRecipe, foodCostPct });
const cooked = (productId: string, noRecipe: boolean, sizes: ReturnType<typeof size>[]): RecipeCostDish =>
  ({ productId, name: productId, category: null, noRecipe, sizes }) as RecipeCostDish;

describe('owner, 2026-11-20 — the Menu reads section by section', () => {
  const cats = [
    { id: 'starters', name: 'Starters' },
    { id: 'mains', name: 'Main course' },
  ];

  it('groups in the sections\' own order, dishes in no section last', () => {
    const g = groupBySection([dish('naan', null), dish('curry', 'mains'), dish('tikka', 'starters')], cats);
    expect(g.map((x) => x.name)).toEqual(['Starters', 'Main course', null]);
  });

  it('keeps the sort inside a section: grouping never undoes it', () => {
    const sorted = [dish('b-curry', 'mains'), dish('a-tikka', 'starters'), dish('a-curry', 'mains')];
    expect(groupedOrder(sorted, cats).map((p) => p.id)).toEqual(['a-tikka', 'b-curry', 'a-curry']);
  });

  it('a dish in a section that is not on this list (a stale id) reads as no section, not a lost row', () => {
    expect(groupedOrder([dish('x', 'gone')], cats).map((p) => p.id)).toEqual(['x']);
  });
});

describe('owner, 2026-11-20 — a dish\'s recipe, from the list Inventory\'s Recipes tab read', () => {
  it('none, partial (a size has none) or done', () => {
    expect(recipeStateOf(cooked('a', true, [size(true)]))).toBe('none');
    expect(recipeStateOf(cooked('b', false, [size(false), size(true)]))).toBe('partial');
    expect(recipeStateOf(cooked('c', false, [size(false)]))).toBe('done');
  });

  it('the food cost shown is the worst size\'s, and none when the API sent none (the counter)', () => {
    expect(recipeInfoOf(cooked('a', false, [size(false, 22), size(false, 41)])).pct).toBe(41);
    expect(recipeInfoOf(cooked('b', false, [size(false)])).pct).toBeNull();
  });

  it('"Needs a recipe" asks only about dishes on the menu, and nothing before the list has loaded', () => {
    const states = recipeStates([cooked('a', true, [size(true)]), cooked('b', false, [size(false)])]);
    expect(needsRecipe(dish('a', null), states)).toBe(true);
    expect(needsRecipe(dish('b', null), states)).toBe(false);
    expect(needsRecipe(dish('unknown', null), states)).toBe(true);
    expect(needsRecipe(dish('a', null, { active: false }), states)).toBe(false);
    expect(needsRecipe(dish('a', null), null)).toBe(false);
  });
});

describe('owner, 2026-11-20 — Inventory has no Recipes tab; its old address lands on the Menu', () => {
  const tenant = path.resolve(__dirname, '..');
  it('the tab is gone and the page only redirects, gated as the Menu is', () => {
    expect(readFileSync(path.join(tenant, 'inventory/tabs.ts'), 'utf8')).not.toContain('/inventory/recipes');
    const page = readFileSync(path.join(tenant, 'inventory/recipes/page.tsx'), 'utf8');
    expect(page).toContain("await guardScreen('/stock');");
    expect(page).toContain("redirect(params.branch ? `/stock?show=noRecipe&branch=");
  });

  it('the Food cost report sends "Add their recipes" to the Menu\'s tab', () => {
    // Owner, 2026-11-21 — the report's one layout (FoodCostClean) carries it now.
    expect(readFileSync(path.join(tenant, 'reports/money/FoodCostClean.tsx'), 'utf8')).toContain('href="/stock?show=noRecipe"');
  });

  it('a kitchen\'s laptop opens the Menu as a table; a shop\'s Stock is untouched by the Menu\'s tabs', () => {
    const list = readFileSync(path.join(tenant, 'products/ProductsList.tsx'), 'utf8');
    expect(list).toContain("useState<'cards' | 'table'>('table')");
    expect(list).toContain('const recipesOn = useRecipesOn() && !counted;');
    expect(list).toContain('{!counted ? menuTabs : null}');
  });
});
