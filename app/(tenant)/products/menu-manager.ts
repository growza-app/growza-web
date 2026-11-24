import type { Product, ProductCategory, RecipeCostDish } from '../lib/api-types';

/**
 * Owner, 2026-11-20 — the restaurant's Menu is where a dish's recipe is looked after (Inventory's Recipes tab is gone).
 * Pure helpers for the Menu manager, kept apart from the component so a test can read them without a DOM.
 */

/** Whether a dish has its recipe: every size has one, some sizes have none, or none at all. */
export type RecipeState = 'done' | 'partial' | 'none';

/** One dish's state from `GET /api/v1/stock/recipes` — a dish with sizes is only done when every size has its recipe. */
export function recipeStateOf(dish: Pick<RecipeCostDish, 'noRecipe' | 'sizes'>): RecipeState {
  if (dish.noRecipe) return 'none';
  return dish.sizes.some((s) => s.noRecipe) ? 'partial' : 'done';
}

/** A dish's recipe on the Menu: its state, and — for whoever is sent the money — its highest food cost % across its sizes. */
export interface RecipeInfo {
  state: RecipeState;
  /** The worst size's food cost (what Inventory's Recipes tab showed); null when not sent, or no size has one. */
  pct: number | null;
  /**
   * Owner, 2026-11-24 — "use recipe cost when no cost price": every size's recipe can be costed (a recipe, every
   * ingredient priced), so Reports' Profit counts the dish even with no cost price typed. False when not sent.
   */
  costed: boolean;
}

export function recipeInfoOf(dish: Pick<RecipeCostDish, 'noRecipe' | 'sizes'>): RecipeInfo {
  const pcts = dish.sizes.map((s) => s.foodCostPct).filter((n): n is number => typeof n === 'number');
  const costed = dish.sizes.length > 0 && dish.sizes.every((s) => typeof s.costMinor === 'number');
  return { state: recipeStateOf(dish), pct: pcts.length > 0 ? Math.max(...pcts) : null, costed };
}

export function recipeStates(dishes: readonly RecipeCostDish[]): Map<string, RecipeInfo> {
  return new Map(dishes.map((d) => [d.productId, recipeInfoOf(d)]));
}

/** The Menu's three tabs: what is on the menu, what still needs its recipe, what was taken off. */
/** Owner, 2026-11-24 — `noCost`: dishes on the menu with no cost price and no costed recipe, which Profit leaves out (Reports links here). */
export type MenuTab = 'all' | 'noRecipe' | 'noCost' | 'retired';

/** A dish Reports' Profit cannot cost: no cost price typed, and no recipe that can be costed for every size. */
export const lacksCost = (p: Pick<Product, 'id' | 'costMinor'>, states: ReadonlyMap<string, RecipeInfo> | null): boolean =>
  p.costMinor == null && !(states?.get(p.id)?.costed ?? false);

/** "Needs a recipe" is a dish on the menu with none, or with a size that has none. A taken-off dish is not asked about. */
export const needsRecipe = (p: Pick<Product, 'id' | 'active'>, states: ReadonlyMap<string, RecipeInfo> | null): boolean =>
  p.active && states !== null && (states.get(p.id)?.state ?? 'none') !== 'done';

/** A section of the grouped table: its name (null for dishes in none), and its dishes in the order they came. */
export interface MenuGroup {
  id: string | null;
  name: string | null;
  rows: Product[];
}

/**
 * The table is read section by section, in the order the owner keeps the sections (the categories' own order),
 * with dishes in no section last. Within a section the rows keep the order they were given — the sort the owner
 * picked — so grouping never undoes a sort.
 */
export function groupBySection(rows: readonly Product[], categories: readonly Pick<ProductCategory, 'id' | 'name'>[]): MenuGroup[] {
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const groups = new Map<string | null, MenuGroup>();
  for (const p of rows) {
    const key = p.categoryId && order.has(p.categoryId) ? p.categoryId : null;
    let g = groups.get(key);
    if (!g) {
      g = { id: key, name: key ? (categories[order.get(key)!]?.name ?? p.categoryName) : null, rows: [] };
      groups.set(key, g);
    }
    g.rows.push(p);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return order.get(a.id)! - order.get(b.id)!;
  });
}

/** The grouped order flattened, so a page of the table is a slice of what the owner reads top to bottom. */
export const groupedOrder = (rows: readonly Product[], categories: readonly Pick<ProductCategory, 'id' | 'name'>[]): Product[] =>
  groupBySection(rows, categories).flatMap((g) => g.rows);

/** How many section colours there are (`--cat-1` … `--cat-6`); a seventh section takes the first again. */
export const SECTION_HUES = 6;

/**
 * Owner, 2026-11-20 — each Menu section's colour (1–6), by its place in the menu's order, so a section keeps its colour
 * from page to page and the order the owner set decides it. Null for dishes in no section: they stay grey.
 */
export function sectionHue(id: string | null, categories: readonly Pick<ProductCategory, 'id'>[]): number | null {
  if (id === null) return null;
  const i = categories.findIndex((c) => c.id === id);
  return i < 0 ? null : (i % SECTION_HUES) + 1;
}

/** A section's average food cost over the dishes that have one (null when none does), to one decimal. */
export function averagePct(pcts: readonly (number | null | undefined)[]): number | null {
  const known = pcts.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  if (known.length === 0) return null;
  return Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 10) / 10;
}
