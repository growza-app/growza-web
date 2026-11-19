import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canSee } from '../lib/nav-policy';
import { areasOf, DIARY_AREAS, type Areas, type PageGrid } from '../lib/areas';
import { INVENTORY_TABS } from './tabs';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Jira GRW-741 — Inventory as its own section: who is offered which tab, that the Menu is dishes only again, that nothing still links to the
 * old address, and that every word is in English and Hindi. The API half (the Recipes list, the supplier's stock ins, what was used, stock
 * still moving on cooking) is test/integration/inventory-section.integration.test.ts in the API repo.
 */
const KITCHEN: Areas = { bookings: false, services: false, shop: true, stock: false, tables: true, recipes: true, kitchenStock: true };
const SHOP: Areas = { bookings: false, services: false, shop: true, stock: true };
/** The restaurant vertical's role templates (docs/architecture/verticals/restaurant.v1.json). */
const GRIDS: Record<string, PageGrid> = {
  manager: { bookings: 'manage', clients: 'manage', services: 'manage', offers: 'manage', staff: 'manage', attendance: 'manage', reports: 'manage', settings: 'manage' },
  counter: { bookings: 'manage', clients: 'manage', services: 'view', attendance: 'view', kitchen: 'manage' },
  waiter: { tables: 'manage' },
  cook: { kitchen: 'manage' },
  staff: { attendance: 'view' },
};
const offered = (who: keyof typeof GRIDS | 'owner'): string[] =>
  INVENTORY_TABS.map((t) => t.href).filter((href) =>
    who === 'owner' ? canSee(href, 'owner', undefined, true, KITCHEN) : canSee(href, 'receptionist', undefined, true, { ...KITCHEN, pages: GRIDS[who] }),
  );

describe('FR-01 · AC-01 · AC-02 — who is offered Inventory, tab by tab', () => {
  it('the owner and a manager: all three tabs — Stock, Recipes, Reports (Jira GRW-744)', () => {
    const all = INVENTORY_TABS.map((t) => t.href);
    expect(offered('owner')).toEqual(all);
    expect(offered('manager')).toEqual(all);
  });

  it('the counter: Stock and Recipes — never Reports (the money); Suppliers is not a tab and stays closed to them', () => {
    expect(offered('counter')).toEqual(['/inventory', '/inventory/recipes']);
    expect(canSee('/inventory/suppliers', 'receptionist', undefined, true, { ...KITCHEN, pages: GRIDS.counter })).toBe(false);
  });

  it('the cook: Stock, exactly — the kitchen reads what is left and what to buy (its To buy filter), and nothing it costs', () => {
    expect(offered('cook')).toEqual(['/inventory']);
    // Their other place: the kitchen screen.
    expect(canSee('/kitchen', 'receptionist', undefined, true, { ...KITCHEN, pages: GRIDS.cook })).toBe(true);
  });

  it('QA — FR-01: switched off, only the owner is offered it (the switch is on its Stock tab); the staff are offered none of it', () => {
    const off: Areas = { ...KITCHEN, kitchenStock: undefined };
    expect(INVENTORY_TABS.map((t) => t.href).filter((h) => canSee(h, 'owner', undefined, true, off))).toEqual(INVENTORY_TABS.map((t) => t.href));
    for (const who of ['manager', 'counter', 'cook'] as const) {
      expect(INVENTORY_TABS.filter((t) => canSee(t.href, 'receptionist', undefined, true, { ...off, pages: GRIDS[who] })), who).toEqual([]);
    }
    expect(canSee('/inventory', 'manager', undefined, true, off)).toBe(false);
    // The old addresses follow the same rule.
    expect(canSee('/stock/kitchen', 'receptionist', undefined, true, { ...off, pages: GRIDS.cook })).toBe(false);
  });

  it('QA — /me says whether it is switched on; only a restaurant that says true has it', () => {
    expect(areasOf({ capabilities: { recipes: true, kitchenStock: true } }).kitchenStock).toBe(true);
    expect(areasOf({ capabilities: { recipes: true, kitchenStock: false } }).kitchenStock).toBeUndefined();
    expect(areasOf({ capabilities: { recipes: true } }).kitchenStock).toBeUndefined();
    expect(areasOf({ capabilities: { kitchenStock: true } }).kitchenStock).toBeUndefined();
  });

  it('AC-02 — a waiter and the Staff role: none of it', () => {
    expect(offered('waiter')).toEqual([]);
    expect(offered('staff')).toEqual([]);
  });

  it('AC-02 — a salon owner and a shop owner: none of it (a capability, never a vertical name, decides)', () => {
    for (const areas of [DIARY_AREAS, SHOP]) for (const t of INVENTORY_TABS) expect(canSee(t.href, 'owner', undefined, true, areas), t.href).toBe(false);
  });

  it('the old addresses are a restaurant’s only, as before', () => {
    expect(canSee('/stock/kitchen', 'owner', undefined, true, DIARY_AREAS)).toBe(false);
    expect(canSee('/reports/food-cost', 'owner', undefined, true, SHOP)).toBe(false);
  });

  it('before go-live Inventory is setup: an owner stocks the kitchen before the first order', () => {
    expect(canSee('/inventory', 'owner', undefined, false, KITCHEN)).toBe(true);
    expect(canSee('/inventory/buy', 'owner', undefined, false, KITCHEN)).toBe(true);
  });
});

const tenant = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(path.join(tenant, rel), 'utf8');
function sources(dir = tenant): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('FR-07 · the Menu — one screen, one address', () => {
  it('the Menu is dishes only: MenuTabs is gone, and nothing draws the "Dishes | Stock" pair', () => {
    expect(existsSync(path.join(tenant, 'components/MenuTabs.tsx'))).toBe(false);
    expect(read('products/ProductsList.tsx')).not.toContain('MenuTabs');
  });

  it('no screen links to /stock/kitchen or /reports/food-cost any more; their pages only redirect', () => {
    // The two redirects themselves, and the area gate that keeps their addresses a restaurant's, are the only places they may appear.
    const linking = sources().filter((f) => !/stock\/kitchen\/page\.tsx$|reports\/food-cost\/page\.tsx$|lib\/areas\.ts$/.test(f) && /['"`]\/stock\/kitchen|['"`]\/reports\/food-cost/.test(readFileSync(f, 'utf8')));
    expect(linking.map((f) => path.relative(tenant, f))).toEqual([]);
    expect(read('stock/kitchen/page.tsx')).toMatch(/const tab = params\.show === 'no-recipe' \? '\/inventory\/recipes' : '\/inventory';/);
    expect(read('stock/kitchen/page.tsx')).toContain("params.show === 'to-buy' ? 'show=to-buy' : null");
    expect(read('inventory/buy/page.tsx')).toContain('redirect(`/inventory?show=to-buy');
    expect(read('reports/food-cost/page.tsx')).toContain("'/inventory/reports'");
  });

  it('each tab is a page of its own, guarded by its own address, drawn in the one Inventory frame', () => {
    for (const t of INVENTORY_TABS) {
      const file = path.join(t.href.replace(/^\//, ''), 'page.tsx');
      const src = read(file);
      expect(src, file).toContain(`await guardScreen('${t.href}');`);
      expect(src, file).toContain(`<InventoryScreen tab="${t.key}"`);
    }
  });

  it('the side menu lists Inventory right below the Menu, and More lists it on a phone', () => {
    const side = read('components/Sidebar.tsx');
    expect(side.indexOf("href: '/inventory'")).toBeGreaterThan(side.indexOf("href: '/stock'"));
    expect(side.indexOf("href: '/inventory'")).toBeLessThan(side.indexOf("href: '/appointments'"));
    expect(read('more/page.tsx')).toContain("href: '/inventory'");
    // The kitchen screen's own bar opens it for the cook.
    expect(read('kitchen/KitchenClient.tsx')).toContain('href="/inventory"');
  });
});

describe('Rename and Hindi — "Kitchen stock" is "Inventory" everywhere', () => {
  const strings = (o: unknown): string[] => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : []);

  it('no English string says "kitchen stock", and no Hindi one says किचन स्टॉक or किचन का स्टॉक', () => {
    expect(strings(en).filter((s) => /kitchen stock/i.test(s))).toEqual([]);
    expect(strings(hi).filter((s) => /किचन (का )?स्टॉक/.test(s))).toEqual([]);
    expect(en.kitchenStock.title).toBe('Inventory');
    expect(hi.kitchenStock.title).toBe('इन्वेंटरी');
  });

  it('every new word has its Hindi: the tabs, the cook’s tabs, the Buy tab, Recipes, a supplier’s stock ins, what was used', () => {
    const keysOf = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keysOf(v as object, `${prefix}${k}.`) : [`${prefix}${k}`]));
    for (const ns of ['tabs', 'cookTabs', 'buyTab', 'recipes', 'suppliers'] as const) {
      expect(keysOf(hi.kitchenStock[ns]).sort(), ns).toEqual(keysOf(en.kitchenStock[ns]).sort());
    }
    for (const k of ['usedTitle', 'usedNote', 'noUsed', 'usedUnpriced'] as const) {
      expect(hi.moneyReports.foodCost[k], k).toBeTruthy();
      expect(hi.moneyReports.foodCost[k]).not.toBe(en.moneyReports.foodCost[k]);
    }
  });
});

describe('AC-05 — 344px: the tab row scrolls inside itself, never the page', () => {
  it('the row may not wrap, scrolls sideways on its own, and each tab is a 44px target', () => {
    const css = read('styles/99-inventory.css');
    const rule = (sel: string) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
    expect(rule('.inv-tabs')).toMatch(/overflow-x: auto/);
    expect(rule('.inv-tabs')).toMatch(/min-width: 0/);
    expect(rule('.inv-tab')).toMatch(/min-height: 44px/);
    expect(rule('.inv-tab')).toMatch(/white-space: nowrap/);
    expect(rule('.inv-tab')).toMatch(/font-size: var\(--fs-3\)/);
  });

  it('the sheet is loaded before the Emerald theme', () => {
    const globals = read('globals.css');
    expect(globals.indexOf("99-inventory.css")).toBeGreaterThan(0);
    expect(globals.indexOf("99-inventory.css")).toBeLessThan(globals.indexOf('99-z-emerald-v2.css'));
  });
});

/** QA of GRW-741 (2026-11-18) — each finding kept as the check that would have caught it. */
describe('QA of GRW-741', () => {
  const src = (p: string) => readFileSync(path.resolve(__dirname, p), 'utf8');

  it('the phone’s Back closes the recipe sheet and stays on Recipes', () => {
    expect(src('RecipeSheet.tsx')).toContain('useBackCloses(onClose);');
  });

  it('a tab replaces the address, so ← leaves Inventory in one tap', () => {
    expect(src('InventoryTabs.tsx')).toMatch(/href=\{tab\.href\}\s*replace\b/);
  });

  it('Stock (Jira GRW-744): Stock in is on the action bar, only while it is switched on and has items; To buy is a filter with past stock ins', () => {
    const stock = src('KitchenStockClient.tsx');
    expect(stock).toContain('const mayStockIn = mayChange && data.on && materials.length > 0;');
    expect(stock).toContain("onClick={() => setSheet({ kind: 'stockIn', id: null })}");
    expect(stock).toContain('<BuyList key={round} branchId={branchId} />');
    expect(stock).toContain("onClick={() => setSheet({ kind: 'purchases' })}");
    for (const m of [en, hi]) for (const k of ['itemsFailed', 'off'] as const) expect(m.kitchenStock.buyTab[k], k).toBeTruthy();
    for (const m of [en, hi]) expect(m.kitchenStock.filter.toBuy).toBeTruthy();
  });

  it('a dish costing more than its price says "check the price", in English and Hindi', async () => {
    const { costsMoreThanPrice } = await import('../lib/food-cost');
    expect(costsMoreThanPrice(200_000)).toBe(true);
    expect(costsMoreThanPrice(100)).toBe(false);
    expect(costsMoreThanPrice(null)).toBe(false);
    expect(src('RecipesClient.tsx')).toContain("t('overPrice')");
    expect(src('../products/RecipePanel.tsx')).toContain("t('overPrice')");
    for (const m of [en, hi]) {
      expect(m.recipe.overPrice).toBeTruthy();
      expect(m.kitchenStock.recipes.overPrice).toBeTruthy();
    }
  });

  it('a saved link’s days open those days (the old food-cost address passes from and to on)', () => {
    const shell = src('../reports/money/MoneyShell.tsx');
    expect(shell).toContain("params?.get('from')");
    expect(shell).toContain("clampReportRange(from, to, todayISO, 'to', opts.maxDays)");
  });

  it('Kitchen stations and Inventory share no class name (one broke the other, and Offers’ heading)', () => {
    const stations = src('../settings/kitchen-stations/KitchenStationsSetup.tsx');
    const sheet = src('../styles/99-kitchen-stations.css').split('*/').slice(1).join('*/');
    expect(stations).not.toMatch(/\bks-/);
    expect(sheet).not.toMatch(/\.ks[-\s{]/);
    expect(src('../settings/offers/BillOffersSetup.tsx')).toContain('className="kst-title"');
  });

  it('copy: "2 entries have no price yet and are not in the totals"', () => {
    expect(en.moneyReports.foodCost.lossUnpriced).toContain('# entries have no price yet and are}');
  });
});
