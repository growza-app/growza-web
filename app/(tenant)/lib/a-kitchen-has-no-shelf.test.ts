import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { areaAllows, areasOf, DIARY_AREAS, type Areas } from './areas';

/**
 * A kitchen's dashboard: the shop's app, with every count left out rather than drawn at nought.
 *
 * The restaurant vertical reuses the shop's screens whole — Orders, the till, the Menu, roles, attendance, every
 * sales report. The one thing it does not have is a count: a dish is cooked when it is ordered. So the screens that
 * exist ONLY to read or change a count are closed, and the ones that merely show a number beside a thing draw the
 * thing without it. These read the source the way the rest of this repo's screen tests do.
 */
const src = (p: string) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8');
const list = src('products/ProductsList.tsx');
const sheet = src('products/ProductSheet.tsx');
const home = src('components/home/ShopHome.tsx');
const ret = src('sales/ReturnProductSheet.tsx');
const order = src('orders/[id]/OrderClient.tsx');

const KITCHEN: Areas = { bookings: false, services: false, shop: true, stock: false };
const SHOP: Areas = { ...KITCHEN, stock: true };

describe('`/me` says whether there is a count, and only an explicit no takes it away', () => {
  it('reads `capabilities.stockCounted`', () => {
    expect(areasOf({ surface: 'shop', capabilities: { stockCounted: false } }).stock).toBe(false);
    expect(areasOf({ surface: 'shop', capabilities: { stockCounted: true } }).stock).toBe(true);
  });

  it('an API a deploy behind — no key at all — leaves every business the shelf it has', () => {
    expect(areasOf({ surface: 'shop', capabilities: {} }).stock).toBe(true);
    expect(areasOf({}).stock).toBe(true);
    expect(areasOf(null).stock).toBe(true);
    expect(DIARY_AREAS.stock).toBe(true);
  });
});

describe('the screens that are only a count are closed', () => {
  it('what the shelf is worth, and what to order before it runs out', () => {
    expect(areaAllows('/stock/report', KITCHEN)).toBe(false);
    expect(areaAllows('/stock/order', KITCHEN)).toBe(false);
    expect(areaAllows('/stock/report', SHOP)).toBe(true);
    expect(areaAllows('/stock/order', SHOP)).toBe(true);
  });

  it('but the menu is not one of them: `/stock` IS the catalogue screen, and a kitchen has a menu', () => {
    expect(areaAllows('/stock', KITCHEN)).toBe(true);
    expect(areaAllows('/products', KITCHEN)).toBe(true);
    expect(areaAllows('/products/sell', KITCHEN)).toBe(true);
  });

  it('nor are the sales reports under the same address: what sold is not a count', () => {
    expect(areaAllows('/stock/sellers', KITCHEN)).toBe(true);
    expect(areaAllows('/stock/channels', KITCHEN)).toBe(true);
  });

  it('a diary business is untouched by any of it', () => {
    for (const href of ['/appointments', '/services', '/sales', '/providers']) expect(areaAllows(href, DIARY_AREAS), href).toBe(true);
    expect(DIARY_AREAS.stock).toBe(true);
  });
});

describe('the Menu screen draws a dish without a count', () => {
  it('asks the one question once, from the areas', () => {
    expect(list).toMatch(/const counted = areas\.stock;/);
  });

  it('leaves out the three filters and the one sort that are a count', () => {
    expect(list).toMatch(/UNCOUNTED_FILTERS: readonly ShelfFilter\[\] = \['all', 'retired'\]/);
    expect(list).toMatch(/UNCOUNTED_SORTS: readonly ShelfSort\[\] = \['name', 'sold', 'price', 'cost', 'status'\]/);
    expect(list).toMatch(/\(counted \? SHELF_FILTERS : UNCOUNTED_FILTERS\)\.map/);
    expect(list).toMatch(/\(counted \? SHELF_SORTS : UNCOUNTED_SORTS\)\.map/);
  });

  it('a filter about a count can never be the one in force, even arriving by address', () => {
    expect(list).toMatch(/useState<ShelfFilter>\(counted \? initialFilter : 'all'\)/);
  });

  it('shows two figures instead of four: stock value, running low and out of stock are all a count', () => {
    expect(list).toMatch(/const strip = !counted \? \(\s*uncountedStrip/);
    expect(list).toMatch(/prd-strip prd-strip-2/);
    expect(list).toMatch(/strip\.onMenu/);
    expect(list).toMatch(/strip\.offMenu/);
  });

  it('drops the Stock column from the desk table and the count pill from the phone row', () => {
    expect(list).toMatch(/\{counted \? \(\s*<SortableTh col="stock"/);
    expect(list).toMatch(/if \(!counted\) return <span className=\{`prd-pill prd-pill-\$\{p\.active \? 'ok' : 'off'\}`\}/);
  });

  it('offers neither the stock take nor the stock report from its header', () => {
    expect(list).toMatch(/heading !== undefined && canStockTake && counted \?/);
    expect(list).toMatch(/live\.length > 0 && canStockTake && counted \?/);
  });

  it('says plainly what the screen is, instead of a subtitle about counts', () => {
    expect(list).toMatch(/!counted \? t\('uncountedSubtitle'\)/);
    expect(en.products.uncountedSubtitle).toContain('made when it is ordered');
    expect(hi.products.uncountedSubtitle.length).toBeGreaterThan(10);
  });
});

describe('the dish sheet is two tabs, not three', () => {
  it('no Stock tab, and no stock panel behind it', () => {
    expect(sheet).toMatch(/const counted = useAreas\(\)\.stock;/);
    expect(sheet).toMatch(/prd-seg prd-seg-\$\{counted \? 3 : 2\}/);
    expect(sheet).toMatch(/counted \? \(\['details', 'stock', 'sales'\] as const\) : \(\['details', 'sales'\] as const\)/);
    expect(sheet).toMatch(/\) : counted && part === 'stock' && product \? \(\s*<StockPanel/);
  });

  it('no opening count on a new dish and no low-stock line on any', () => {
    expect(sheet).toMatch(/\{!product && counted \? \(/);
    expect(sheet).toMatch(/\{counted \? \(\s*<div className="prd-field">\s*<label className="prd-field-label" htmlFor="prd-low">/);
  });
});

describe('Home and the return sheet', () => {
  it('Home drops the Stock worth card and the stock attention card, and the rows close up', () => {
    expect(home).toMatch(/hm-v3-kpis\$\{areas\.stock \? '' : ' hm-v3-kpis-3'\}/);
    expect(home).toMatch(/hm-v3-bot\$\{areas\.stock \? '' : ' hm-v3-bot-2'\}/);
    // Three: the desk Stock-worth KPI, the desk stock-attention card, and the phone "Running out" card.
    expect(home.match(/\{!areas\.stock \? null : \(/g) ?? []).toHaveLength(3);
    expect(home).toMatch(/\{!areas\.stock \? null : can\('\/stock'\) \? \(/);
    expect(home).toMatch(/data\.running\.counted \|\| !areas\.stock \? s\.noOrdersBody : s\.countFirst/);
    const css = src('styles/83-role-home.css');
    expect(css).toMatch(/\.hm-v3-kpis-3 \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    expect(css).toMatch(/\.hm-v3-bot-2 \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });

  it('a return still refunds and is still recorded; only "put it back or write it off" is not asked', () => {
    expect(ret).toMatch(/const counted = useAreas\(\)\.stock;/);
    expect(ret).toMatch(/<div className="sls-ret-condition" hidden=\{!counted\}>/);
    // The refund method and the reason are NOT a count, and are still asked for.
    expect(ret).toMatch(/refundModeLabel/);
    expect(ret).toMatch(/reasonCode/);
  });
});

/*
 * Code review, 2026-10-23. Five things the first cut of this vertical got wrong, each with the test that would
 * have caught it. Four are about drawing a kitchen's screen; the fifth is a retail regression.
 */
describe('what the review found', () => {
  it('the Menu table has one header per cell — the Stock column becomes Sold, it does not vanish', () => {
    // The body ALWAYS renders a cell in that position, in BOTH arms of its ternary, so a header dropped
    // outright leaves one more cell than headings and shifts every row left by one under the wrong word.
    const head = list.slice(list.indexOf('<thead>'), list.indexOf('</thead>'));
    const body = list.slice(list.indexOf('<tbody>'), list.indexOf('</tbody>'));
    expect(head).toMatch(/\{counted \? \(\s*<SortableTh col="stock"/);
    expect(head).toMatch(/\) : \(\s*<SortableTh col="sold" label=\{t\('cols\.sold'\)\}/);
    expect(body).toMatch(/\{counted \? \(\s*<td className="prd-td-num">/);
    expect(body).toMatch(/\) : \(\s*<td className="prd-td-num prd-td-muted">/);
    // Neither arm of either ternary may be `null`: that is the shape the review caught.
    expect(head).not.toMatch(/\{counted \? <SortableTh col="stock"[^}]*\/> : null\}/);
    expect(en.products.cols.sold).toBe('Sold');
    expect(hi.products.cols.sold.length).toBeGreaterThan(0);
  });

  it('the Menu strip of two has a rule of its own, not the three-column default', () => {
    const css = src('styles/96-products.css');
    expect(list).toMatch(/className="prd-strip prd-strip-2"/);
    expect(css).toMatch(/\.prd-strip\.prd-strip-2 \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });

  it('a kitchen\'s return is never called damaged: the API says `restocked: false` for want of a shelf, not for damage', () => {
    expect(ret).toMatch(/\{counted \? <> · \{it\.restocked \? t\('restockShelf'\) : t\('damagedOpened'\)\}<\/> : null\}/);
    expect(order).toMatch(/const counted = useAreas\(\)\.stock;/);
    expect(order).toMatch(/\{counted && !r\.restocked \? <span className="ord-d-quiet"> · \{t\('detail\.notRestocked'\)\}<\/span> : null\}/);
  });
});

describe('the food graphics do not reach into another vertical', () => {
  it('a garment is a garment: the savoury rules come after the apparel rule', async () => {
    const { resolveProductGraphic } = await import('../components/ProductPhoto');
    // Each of these is a real retail name carrying a word the restaurant rules claim.
    expect(resolveProductGraphic({ name: 'Chinese Collar Shirt', categoryName: 'Shirts' }).kind).toBe('shirt');
    expect(resolveProductGraphic({ name: 'Tea Rose Top', categoryName: 'Tops' }).kind).toBe('shirt');
    expect(resolveProductGraphic({ name: 'Masala Tikka Kurta', categoryName: 'Kurtas' }).kind).toBe('shirt');
    // And the kitchen still gets its own, because a dish is not named after a garment.
    expect(resolveProductGraphic({ name: 'Chicken Tikka', categoryName: 'Starters' }).kind).toBe('bowl');
    expect(resolveProductGraphic({ name: 'Masala Chai', categoryName: 'Beverages' }).kind).toBe('drink');
    expect(resolveProductGraphic({ name: 'Veg Hakka Noodles', categoryName: 'Chinese' }).kind).toBe('rice');
  });
});
