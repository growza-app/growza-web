import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { areaAllows, areasOf, DIARY_AREAS, type Areas } from './areas';
import { canSee, visibleItems } from './nav-policy';
import { homeCopy } from './home-copy';
import type { MemberRole } from '@growza-app/shared';

/**
 * Jira GRW-608 — retail has its own routes: the salon's screens gain no conditional and no weight.
 *
 * What a business is offered is a function of three facts the API sends (`capabilities.bookings`, `capabilities.services`,
 * `surface`), asked at the one chokepoint every nav surface and every screen guard already asks.
 */
const SHOP: Areas = { bookings: false, services: false, shop: true };
const tenant = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(tenant, p), 'utf8');

/** Every destination any nav surface offers, today. */
const ALL = ['/', '/appointments', '/appointments/new', '/availability', '/sales', '/customers', '/services', '/packages', '/products', '/products/sell', '/offers', '/providers', '/attendance', '/reports', '/notifications', '/try-whatsapp', '/settings', '/more', '/help', '/orders', '/stock'] as const;
const ROLES: Array<MemberRole | null> = ['owner', 'manager', 'receptionist', 'staff', null];
const offered = (areas: Areas | undefined, role: MemberRole | null = 'owner') => ALL.filter((h) => canSee(h, role, ['overview'], true, areas));

describe('areasOf — what `/me` says, with the nav erring open', () => {
  it('a session that cannot say is the salon’s full set', () => {
    expect(areasOf(undefined)).toEqual(DIARY_AREAS);
    expect(areasOf(null)).toEqual(DIARY_AREAS);
    expect(areasOf({})).toEqual(DIARY_AREAS);
    expect(areasOf({ capabilities: {} })).toEqual(DIARY_AREAS);
  });

  it('only an explicit false takes a diary area away, and only `shop` adds the shop’s', () => {
    expect(areasOf({ capabilities: { bookings: false, services: false }, surface: 'shop' })).toEqual(SHOP);
    expect(areasOf({ capabilities: { bookings: false }, surface: 'diary' })).toEqual({ bookings: false, services: true, shop: false });
    expect(areasOf({ capabilities: { bookings: true, services: true }, surface: 'diary' })).toEqual(DIARY_AREAS);
  });

  it('an unknown surface is not the shop', () => {
    expect(areasOf({ surface: 'marketplace' }).shop).toBe(false);
  });
});

describe('AC-01 — a shop sees a shop’s app', () => {
  it('the owner is offered Home, Orders, Stock, Clients, Reports and Settings — and Bookings, Free times and Services are absent', () => {
    const shop = offered(SHOP);
    for (const must of ['/', '/orders', '/stock', '/customers', '/reports', '/settings']) expect(shop, must).toContain(must);
    for (const gone of ['/appointments', '/appointments/new', '/availability', '/services', '/packages', '/offers', '/sales', '/providers', '/attendance']) expect(shop, gone).not.toContain(gone);
  });

  it('the pinned route set per vertical: salon and shop', () => {
    expect(offered(DIARY_AREAS)).toEqual(['/', '/appointments', '/appointments/new', '/availability', '/sales', '/customers', '/services', '/packages', '/products', '/products/sell', '/offers', '/providers', '/attendance', '/reports', '/notifications', '/try-whatsapp', '/settings', '/more', '/help']);
    expect(offered(SHOP)).toEqual(['/', '/customers', '/products', '/products/sell', '/reports', '/notifications', '/try-whatsapp', '/settings', '/more', '/help', '/orders', '/stock']);
  });

  it('the shelf’s own screens stay open to a shop by address (its Stock links into them), though only Stock is offered', () => {
    expect(canSee('/products', 'owner', undefined, true, SHOP)).toBe(true);
    expect(canSee('/products/sell', 'owner', undefined, true, SHOP)).toBe(true);
  });
});

describe('AC-03 — a salon’s app is unchanged', () => {
  it.each(ROLES)('for %s, every destination answers exactly as it did before areas existed', (role) => {
    for (const href of ALL) {
      if (href === '/orders' || href === '/stock') continue; // new addresses: pinned below
      expect(canSee(href, role, ['overview'], true, DIARY_AREAS), `${role} ${href}`).toBe(canSee(href, role, ['overview'], true));
    }
  });

  it('a salon is never offered the shop’s two screens, for any role', () => {
    for (const role of ROLES) {
      expect(canSee('/orders', role, ['overview'], true, DIARY_AREAS), `${role} /orders`).toBe(false);
      expect(canSee('/stock', role, ['overview'], true, DIARY_AREAS), `${role} /stock`).toBe(false);
    }
  });
});

describe('boundaries — unknown vertical, a limited role, a clinic that keeps its diary', () => {
  it('an absent areas argument is the salon’s set: the nav errs open, never blank', () => {
    expect(offered(undefined)).toEqual(offered(DIARY_AREAS));
  });

  it('a limited role keeps the existing role rules on the shop’s screens: nobody but the owner and manager opens Stock', () => {
    expect(canSee('/orders', 'staff', undefined, true, SHOP)).toBe(false);
    expect(canSee('/stock', 'staff', undefined, true, SHOP)).toBe(false);
    expect(canSee('/stock', 'receptionist', undefined, true, SHOP)).toBe(false);
    expect(canSee('/orders', 'manager', undefined, true, SHOP)).toBe(true);
    expect(canSee('/stock', 'manager', undefined, true, SHOP)).toBe(true);
  });

  /*
   * Jira GRW-614 — Orders is the front desk's own list now, not the Sales register under another name, so it is offered
   * to a desk always: the API serves it without amounts unless the owner has opened the `sales` tab. (Jira GRW-611's
   * review made it conditional on that tab while `/orders` still rendered the register, whose only read the API refuses
   * a desk without the tab — a nav entry that could not work. The list is what makes the entry work.)
   */
  it('a shop’s front desk is offered Orders, with or without the sales tab — and the till stays theirs', () => {
    for (const tabs of [undefined, [], ['overview'], ['sales']]) {
      expect(canSee('/orders', 'receptionist', tabs, true, SHOP), JSON.stringify(tabs)).toBe(true);
    }
    expect(canSee('/products/sell', 'receptionist', undefined, true, SHOP)).toBe(true);
    // Stock is the owner's and manager's: counting the shelf is not the desk's job.
    expect(canSee('/stock', 'receptionist', ['sales'], true, SHOP)).toBe(false);
    // …and a stylist has no business with either.
    expect(canSee('/orders', 'staff', ['sales'], true, SHOP)).toBe(false);
  });

  it('a limited role is still not offered what it never was, in a shop', () => {
    expect(canSee('/customers', 'staff', undefined, true, SHOP)).toBe(false);
    expect(canSee('/reports', 'receptionist', [], true, SHOP)).toBe(false);
  });

  it('a business that takes no bookings but still sells services keeps its menu (the areas are independent)', () => {
    const noDiary: Areas = { bookings: false, services: true, shop: false };
    expect(canSee('/services', 'owner', undefined, true, noDiary)).toBe(true);
    expect(canSee('/appointments', 'owner', undefined, true, noDiary)).toBe(false);
  });

  it('whole path segments only: /appointmentsX is not the diary, /orders2 is not the shop', () => {
    expect(areaAllows('/appointmentsX', SHOP)).toBe(true);
    expect(areaAllows('/orders2', DIARY_AREAS)).toBe(true);
  });

  it('while a shop is being set up, counting the shelf is the setup: Stock opens before go-live, Orders does not', () => {
    expect(canSee('/stock', 'owner', undefined, false, SHOP)).toBe(true);
    expect(canSee('/orders', 'owner', undefined, false, SHOP)).toBe(false);
  });

  it('the help page is open to everyone in every shape', () => {
    expect(canSee('/help', 'staff', undefined, false, SHOP)).toBe(true);
  });

  it('visibleItems takes the same answer as canSee', () => {
    const items = ALL.map((href) => ({ href }));
    expect(visibleItems(items, 'owner', ['overview'], true, SHOP).map((i) => i.href)).toEqual(offered(SHOP));
  });
});

describe('FR-03 / AC-02 — reaching a diary screen by address is Home, before any request for it is made', () => {
  const guard = read('lib/screen-guard.ts');

  it('guardScreen and guardLive ask `/me` once for the areas and redirect, ahead of the screen’s own reads', () => {
    expect(guard).toContain('areas = areasOf(me);');
    expect(guard).toMatch(/if \(!canSee\(href, role, reportTabs, true, areas\)\) redirect\('\/'\);/);
    expect(guard).toMatch(/if \(!areaAllows\(href, areas\)\) redirect\('\/'\);/);
  });

  it('the screens a shop reaches by two addresses guard themselves under the one they were opened by, as their first await', () => {
    for (const [file, name] of [['products/ProductsScreen.tsx', 'ProductsScreen'], ['sales/SalesScreen.tsx', 'SalesScreen']] as const) {
      const src = read(file);
      const body = src.slice(src.indexOf(`export async function ${name}`));
      expect(body, file).toMatch(/\{\n(?:\s*\/\/[^\n]*\n)*\s*await guardScreen\(guard\);/);
    }
  });

  it('every diary screen a shop must not see is guarded by an address the policy closes to it', () => {
    for (const [file, guardCall] of [
      ['appointments/page.tsx', "guardLive('/appointments')"],
      ['appointments/new/page.tsx', "guardLive('/appointments/new')"],
      ['availability/page.tsx', "guardScreen('/availability')"],
      ['services/page.tsx', "guardScreen('/services')"],
      ['offers/page.tsx', "guardScreen('/offers')"],
      ['packages/page.tsx', "guardScreen('/packages')"],
      ['providers/page.tsx', "guardScreen('/providers')"],
    ] as const) {
      expect(read(file), file).toContain(`await ${guardCall};`);
    }
    for (const href of ['/appointments', '/appointments/new', '/availability', '/services', '/offers', '/packages', '/providers']) expect(areaAllows(href, SHOP), href).toBe(false);
  });
});

describe('FR-05, FR-06, BR-04 — no conditional in a shared screen, and no retail code in a salon’s routes', () => {
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(full);
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
    });
  const all = sourceFiles(tenant);

  it('nothing outside the shop’s own routes imports them: a salon’s pages carry no retail code', () => {
    const offenders = all.filter((f) => !/[\\/](orders|stock)[\\/]/.test(f) && /from '(\.\.?\/)+(orders|stock)(\/|')/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the shop’s two pages are a few lines each, over the shared screens — nothing is copied (BR-04)', () => {
    for (const f of ['orders/page.tsx', 'stock/page.tsx']) expect(read(f).split('\n').length, f).toBeLessThan(30);
    // Orders has its own screen (Jira GRW-614); Stock is still the shelf under another address.
    expect(read('orders/page.tsx')).toContain("from './OrdersScreen'");
    expect(read('stock/page.tsx')).toContain("from '../products/ProductsScreen'");
  });

  it('no shared screen asks what kind of business this is: the words "shop", "retail" and "salon" never decide anything in them', () => {
    for (const f of ['products/ProductsScreen.tsx', 'sales/SalesScreen.tsx', 'appointments/page.tsx', 'services/page.tsx']) {
      expect(read(f), f).not.toMatch(/surface\b|areas\.shop|'retail'|=== 'salon'/);
    }
  });
});

describe('UX-07 — the new nav labels, in both languages', () => {
  it('English takes the vertical’s own word, falling back to a plain one', () => {
    expect(homeCopy('en', { orders: 'Orders', stock: 'Stock' }).nav.orders).toBe('Orders');
    expect(homeCopy('en', {}).nav.orders).toBe('Orders');
    expect(homeCopy('en', {}).nav.stock).toBe('Stock');
  });

  it('Hindi uses its own generic words (a vertical carries no other language yet)', () => {
    const hi = homeCopy('hi', { orders: 'Orders', stock: 'Stock' });
    expect(hi.nav.orders).toBe('ऑर्डर');
    expect(hi.nav.stock).toBe('स्टॉक');
  });
});
