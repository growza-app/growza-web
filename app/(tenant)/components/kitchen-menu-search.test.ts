import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-643 — the POS dish search found nothing, ever.
 *
 * `ServiceSheet`'s "In stock only" chip started ON and kept only `p.stock > 0`. A kitchen keeps no
 * count (`catalog.stock_counted` off), so every dish reads as 0 left: the pool was empty before a
 * character was typed, and the sheet answered "No dish by that name." to the name of a dish listed
 * on the grid behind it. The sheet was also headed "Products" and offered to search "72 products".
 *
 * A shop that DOES count is untouched — out of stock stays hidden there unless asked, which is what
 * the chip is for. The three pins below are the whole fix, and the fourth is that it is conditional.
 */
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const sheet = read('ServiceSheet.tsx');
/** The same bug, unfixed, on the wide till: an empty grid under category chips counting 72 dishes. */
const grid = read('../appointments/new/DeskServiceGrid.tsx');

describe('a kitchen has no "in stock", so nothing filters by it', () => {
  it('the filter starts off where nothing is counted, not on', () => {
    expect(sheet).toContain('const [inStockOnly, setInStockOnly] = useState(counted);');
    expect(sheet).not.toContain('const [inStockOnly, setInStockOnly] = useState(true);');
  });

  it('the pool asks `counted` as well as the chip, so no toggle can empty the menu', () => {
    expect(sheet).toContain('const pool = inStockOnly && counted ? shelf.filter((p) => p.stock > 0');
    // `counted` decides the pool, so it has to be a dependency of the memo that builds it.
    expect(sheet).toMatch(/\}, \[shelf, productMode, term, sort, inStockOnly, counted, productCounts\]\);/);
  });

  it('the chip itself is not offered where there is nothing to filter by', () => {
    expect(sheet).toContain('{productMode && counted ? (');
  });

  it('a shop that counts keeps the filter it had: on, and hiding what is out of stock', () => {
    // The only two gates are `counted`; neither narrows a counted shop's pool beyond `p.stock > 0`.
    const pool = sheet.slice(sheet.indexOf('const pool = inStockOnly'));
    expect(pool.slice(0, 160)).toContain('(productCounts?.get(p.id) ?? 0) > 0');
    expect(sheet).toContain("className={`pf-chip pf-filter-chip ${inStockOnly ? 'pf-chip-on' : ''}`}");
  });
});

describe('the sheet says Menu and dishes to a kitchen, Products and products to a shop', () => {
  it('the title and the placeholder both ask `counted`, as the button that opens them already did', () => {
    expect(sheet).toContain("t(counted ? 'desk.products' : 'desk.menu')");
    expect(sheet).toContain("t(counted ? 'desk.searchProducts' : 'desk.searchDishes', { count: shelf.length })");
    // The button into the sheet got this right already; the sheet is what disagreed with it.
    expect(read('../appointments/new/PayFlow.tsx')).toContain("t(counted ? 'desk.searchProducts' : 'desk.searchDishes', { count: products.length })");
  });
});

describe('the wide till had the same bug, and worse', () => {
  it('its filter starts off and asks `counted` too', () => {
    expect(grid).toContain('const counted = useAreas().stock;');
    expect(grid).toContain('const [inStockOnly, setInStockOnly] = useState(counted);');
    expect(grid).toContain('const pool = inStockOnly && counted ? byCat.filter((p) => p.stock > 0');
    expect(grid).toMatch(/\}, \[products, productCategory, term, sort, inStockOnly, counted, productCountOf\]\);/);
    expect(grid).toContain("{tab === 'products' && counted ? (");
  });

  it('a dish tile is never disabled for running out, because a dish cannot run out', () => {
    // The worst of it: `|| p.stock <= 0 || count >= p.stock` disabled EVERY tile at 0 stock, so even
    // with the grid full a restaurant could not put a dish on the bill.
    expect(grid).toContain('disabled={(full && count === 0) || (counted && (p.stock <= 0 || count >= p.stock))}');
    expect(grid).not.toMatch(/disabled=\{\(full && count === 0\) \|\| p\.stock <= 0/);
  });

  it('no "none left" badge where nothing is counted', () => {
    expect(grid).toMatch(/\{counted \? \(\s*\n\s*<span className=\{`pf-tile-mins \$\{p\.stock <= 0 \? 'pf-tile-out' : ''\}`\}>/);
  });

  it('its words follow too: Menu, dishes, and "All dishes" on the category rail', () => {
    expect(grid).toContain("t(counted ? 'desk.searchProducts' : 'desk.searchDishes', { count: products.length })");
    expect(grid).toContain("t(counted ? 'desk.noProducts' : 'desk.noDishes')");
    expect(read('../products/DeskProductCategories.tsx')).toContain("t(counted ? 'all' : 'allDishes')");
  });
});
