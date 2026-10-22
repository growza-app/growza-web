import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { areaAllows, areasOf } from '../../lib/areas';
import { canSee } from '../../lib/nav-policy';

/**
 * Jira GRW-616 — the counter takes an order: scan, size, pay, done.
 *
 * `/orders/new` is NOT a second till. It is the till a shop already sells from (`/products/sell`, which is `PayFlow` in its
 * products-only form) under the address and the words a shop uses, exactly as `/stock` is the shelf under another address
 * (Jira GRW-608). The owner chose that over building a one-screen phone till (2026-10-21). So what is pinned here is what
 * makes it one implementation — nothing copied, nothing in the salon's till decided by what kind of business this is — and
 * who may reach it.
 *
 * The behaviour of the till itself (a scan adds the exact size, a double tap on a payment takes the money once, the receipt
 * is offered at once) was checked in a browser at 344px and on a laptop; see the PR.
 */
const app = path.resolve(import.meta.dirname, '../..');
const read = (f: string) => readFileSync(path.join(app, f), 'utf8');
const SHOP = areasOf({ capabilities: { bookings: false, services: false }, surface: 'shop' });
const SALON = areasOf({});

describe('one implementation, two addresses — nothing copied (NFR-06)', () => {
  it('both pages hand the same screen their own address to be guarded under', () => {
    expect(read('orders/new/page.tsx')).toContain('<SellProductScreen searchParams={searchParams} guard="/orders/new" />');
    expect(read('products/sell/page.tsx')).toContain('<SellProductScreen searchParams={searchParams} guard="/products/sell" />');
  });

  it('the new page is a few lines over the shared screen, with no till code of its own', () => {
    const page = read('orders/new/page.tsx');
    expect(page.split('\n').length).toBeLessThan(30);
    expect(page).toContain("from '../../products/sell/SellProductScreen'");
    expect(page).not.toMatch(/PayFlow|useBarcodeScan|api\./);
  });

  it('the screen guards under whichever address it is handed, and asks the same write question for both', () => {
    const screen = read('products/sell/SellProductScreen.tsx');
    expect(screen).toContain('await guardScreen(guard);');
    expect(screen).toContain('await guardLive(guard);');
    expect(screen).toContain("!mayUse(me.member?.role, 'visit.recordPayment', isWritable(me.tenant?.status))");
    // A role that may not take a payment goes back to the list it came from, not to a till that would answer 403.
    expect(screen).toContain("redirect(guard === '/orders/new' ? '/orders' : '/products')");
  });

  it('the shared screen never asks what kind of business this is: it is told its address, and that is all', () => {
    const screen = read('products/sell/SellProductScreen.tsx');
    expect(screen).not.toMatch(/surface\b|areas\.shop|'retail'|=== 'salon'/);
  });

  it('the till’s own name is an optional prop with the old default, so every address that opened it reads as it did', () => {
    const flow = read('appointments/new/PayFlow.tsx');
    expect(flow).toContain("{productsOnly ? (heading ?? t('sellTitle')) : t('whatTitle')}");
    expect(flow).toContain("<h1 className=\"pf-title\">{heading ?? t('sellTitle')}</h1>");
    // The default is still the same word: a salon that opens /products/sell sees "Sell product".
    expect(JSON.parse(read('../../messages/en.json')).payFlow.sellTitle).toBe('Sell product');
  });

  it('a shop’s till says what a shop says — from the vertical’s own words, in both languages — and nobody else’s changes', () => {
    const screen = read('products/sell/SellProductScreen.tsx');
    expect(screen).toContain("forShop ? homeCopy(await serverLang(), me.labels).shop.takeOrder : undefined");
    const copy = read('lib/home-copy.ts');
    expect(copy).toContain("takeOrder: S('Take an order', 'ऑर्डर लें')");
  });
});

describe('who may reach it', () => {
  it('a shop’s owner, manager and FRONT DESK take orders; a stylist does not', () => {
    for (const role of ['owner', 'manager', 'receptionist'] as const) expect(canSee('/orders/new', role, undefined, true, SHOP), role).toBe(true);
    expect(canSee('/orders/new', 'staff', undefined, true, SHOP)).toBe(false);
  });

  it('a business with a diary is never offered it — it has /products/sell, and Orders is a shop’s word', () => {
    for (const role of ['owner', 'manager', 'receptionist', 'staff'] as const) expect(canSee('/orders/new', role, undefined, true, SALON), role).toBe(false);
    expect(areaAllows('/orders/new', SALON)).toBe(false);
    expect(areaAllows('/orders/new', SHOP)).toBe(true);
  });

  it('the till is a live-day screen: a shop that has not gone live is not offered it', () => {
    expect(canSee('/orders/new', 'owner', undefined, false, SHOP)).toBe(false);
  });

  it('the salon keeps its own address exactly as it was', () => {
    for (const role of ['owner', 'manager', 'receptionist'] as const) expect(canSee('/products/sell', role, undefined, true, SALON), role).toBe(true);
  });
});

describe('a shop reaches it from everywhere it takes an order from', () => {
  it('Home’s tile and its first-order button, and the plus on the phone, all open /orders/new', () => {
    const home = read('components/home/ShopHome.tsx');
    expect(home).toContain("{ href: '/orders/new', label: s.takeOrder,");
    expect(home).toContain('href="/orders/new"');
    expect(home).not.toContain('/products/sell');
    expect(read('components/MobileChrome.tsx')).toContain("areas.shop ? '/orders/new' : '/appointments/new?mode=now'");
  });

  it('the Orders list offers it in its header, to whoever may record a sale', () => {
    const list = read('orders/OrdersScreen.tsx');
    expect(list).toContain('href="/orders/new"');
    expect(list).toContain("mayUse(me.member?.role, 'visit.recordPayment', isWritable(me.tenant?.status))");
  });

  it('the salon’s own entrances are untouched', () => {
    expect(read('components/home/OwnerHome.tsx')).toContain("href: '/products/sell'");
    expect(read('components/home/ReceptionHome.tsx')).toContain("href: '/products/sell'");
  });

  it('after the till, a shop goes back to its orders; every other address goes where it always went', () => {
    const screen = read('products/sell/SellProductScreen.tsx');
    expect(screen).toContain("forShop ? '/orders' : params.from === 'products' ? '/products' : params.from === 'sales' ? '/sales' : undefined");
    expect(read('appointments/new/PayFlow.tsx')).toContain("backTo?: '/appointments' | '/products' | '/sales' | '/orders';");
  });
});
