import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { areaAllows, DIARY_AREAS, type Areas } from './areas';
import { canSee } from './nav-policy';
import type { MemberRole } from '@growza-app/shared';

/**
 * Jira GRW-611 — the vertical matrix, dashboard half: every screen under every kind of business.
 *
 * The dashboard has two app shapes (the diary and the shop — what `/me` sends as `surface`). The screens are DISCOVERED
 * from the route tree (every `page.tsx` under app/(tenant)), never typed twice, and each is named in `SCREENS` with who
 * has it. A screen on disk with no entry FAILS, naming the route; so does an entry whose screen is gone. The API half —
 * every route under every vertical, one row per vertical file — lives in the API repo's
 * test/integration/vertical-matrix.integration.test.ts.
 */
const SHOP: Areas = { bookings: false, services: false, shop: true, stock: true };
/** The shop's app with no count behind it (`catalog.stock_counted` off): the restaurant. */
const KITCHEN: Areas = { ...SHOP, stock: false };
type Shape = 'diary' | 'shop' | 'kitchen';
const SHAPES: Array<{ name: string; shape: Shape; areas: Areas }> = [
  { name: 'diary (salon, clinic, spa, garage, dental)', shape: 'diary', areas: DIARY_AREAS },
  { name: 'shop (retail)', shape: 'shop', areas: SHOP },
  { name: 'kitchen (restaurant)', shape: 'kitchen', areas: KITCHEN },
];
const ROLES: Array<MemberRole | null> = ['owner', 'manager', 'receptionist', 'staff', null];

/**
 * Who has a screen. `shop` is every shop, a kitchen among them; `counted` is the narrower set — a shop that keeps a
 * count. A restaurant's menu lives at `/stock` like any shop's shelf, so that screen is `shop`; what the shelf is
 * WORTH and what to re-order are `counted`, and a kitchen has neither.
 */
type Who = 'both' | 'diary' | 'shop' | 'counted';
/** The screen → who has it. The one hand-written thing here; everything else is derived or asked. */
const SCREENS: Readonly<Record<string, Who>> = {
  '/': 'both',
  '/[...rest]': 'both',
  '/appointments': 'diary',
  '/appointments/new': 'diary',
  '/attendance': 'both',
  '/attendance/[providerId]': 'both',
  '/availability': 'diary',
  '/customers': 'both',
  '/documents/[id]': 'both',
  '/help': 'both',
  '/more': 'both',
  '/not-live-yet': 'both',
  '/notifications': 'both',
  '/offers': 'diary',
  '/orders': 'shop',
  '/orders/[id]': 'shop',
  '/orders/held': 'shop',
  '/orders/import': 'shop',
  '/orders/new': 'shop',
  '/orders/refunds': 'shop',
  '/orders/returns': 'shop',
  '/packages': 'diary',
  '/packages/[id]/edit': 'diary',
  '/packages/new': 'diary',
  '/pos': 'both',
  '/products': 'both',
  '/products/[id]/codes': 'both',
  '/products/[id]/sizes': 'both',
  '/products/sell': 'both',
  '/providers': 'diary',
  '/providers/[id]': 'diary',
  '/reports': 'both',
  '/sales': 'diary',
  '/search': 'both',
  '/services': 'diary',
  '/settings': 'both',
  '/settings/billing': 'both',
  '/settings/billing/bills': 'both',
  '/settings/billing/bills/[id]': 'both',
  '/settings/booking': 'diary',
  '/settings/branches': 'both',
  '/settings/business': 'both',
  '/settings/check-in': 'both',
  '/settings/gst': 'both',
  '/settings/notifications': 'both',
  '/settings/payments': 'both',
  '/settings/profile': 'both',
  '/settings/channels': 'shop',
  // Jira GRW-626 — what is waiting for a marketplace; a shop's, like the screen it is linked from.
  '/settings/channels/queue': 'shop',
  '/settings/report-access': 'both',
  '/settings/roles': 'shop',
  '/settings/team': 'both',
  '/settings/working-hours': 'both',
  '/stock': 'shop',
  '/stock/report': 'counted',
  '/stock/channels': 'shop',
  '/stock/order': 'counted',
  '/stock/sellers': 'shop',
  '/try-whatsapp': 'both',
};

const tenant = path.resolve(import.meta.dirname, '..');

/** Every `page.tsx` under app/(tenant), as the route it serves. */
function discover(dir = tenant, route = ''): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (['components', 'lib', 'styles'].includes(name) && dir === tenant) continue;
      found.push(...discover(full, `${route}/${name}`));
    } else if (name === 'page.tsx') found.push(route === '' ? '/' : route);
  }
  return found;
}

/** A concrete address for a dynamic route, as the nav would be asked about it. */
const concrete = (route: string) => route.replace(/\[\.\.\.[^\]]+\]/g, 'x').replace(/\[[^\]]+\]/g, 'x');
const hasIt = (who: Who, shape: Shape): boolean =>
  who === 'both' || (who === 'diary' ? shape === 'diary' : who === 'shop' ? shape !== 'diary' : shape === 'shop');

describe('every screen on disk is named, and every name is a screen', () => {
  const onDisk = discover().sort();

  it('discovers the route tree (a walk that found nothing would pass everything)', () => {
    expect(onDisk.length).toBeGreaterThan(30);
    expect(onDisk).toContain('/orders');
  });

  it('a screen with no entry fails, naming it', () => {
    const unnamed = onDisk.filter((r) => !(r in SCREENS));
    expect(unnamed, `screen(s) with no entry in SCREENS (lib/vertical-matrix.test.ts): ${unnamed.join(', ')} — say who has each: both, diary or shop`).toEqual([]);
  });

  it('an entry whose screen is gone fails, naming it', () => {
    const gone = Object.keys(SCREENS).filter((r) => !onDisk.includes(r));
    expect(gone, `SCREENS names route(s) that no longer exist: ${gone.join(', ')}`).toEqual([]);
  });
});

describe('FR-01 … FR-03 — each kind of business is offered exactly the screens that are its own', () => {
  for (const { name, shape, areas } of SHAPES) {
    it(`${name}: a screen it has is allowed, a screen it lacks is closed — by address, for every role`, () => {
      const wrong: string[] = [];
      for (const [route, who] of Object.entries(SCREENS)) {
        const href = concrete(route);
        if (areaAllows(href, areas) !== hasIt(who, shape)) wrong.push(`${route} (${who}) is ${areaAllows(href, areas) ? 'allowed' : 'closed'} for ${name}`);
      }
      expect(wrong, wrong.join('\n')).toEqual([]);
    });

    it(`${name}: the nav never offers a screen the business lacks (for any role)`, () => {
      for (const role of ROLES) {
        for (const [route, who] of Object.entries(SCREENS)) {
          if (route.includes('[')) continue;
          if (canSee(route, role, ['overview'], true, areas)) {
            expect(hasIt(who, shape), `${route} is offered to a ${role ?? 'signed-out'} in ${name} but is ${who}-only`).toBe(true);
          }
        }
      }
    });
  }

  it('the owner of each shape can reach Home and Settings — no shape is left without a front door', () => {
    for (const { name, areas } of SHAPES) {
      expect(canSee('/', 'owner', ['overview'], true, areas), name).toBe(true);
      expect(canSee('/settings', 'owner', ['overview'], true, areas), name).toBe(true);
    }
  });

  it('another shape is one entry: a screen added with who=both is allowed in every shape', () => {
    for (const { areas } of SHAPES) expect(areaAllows('/a-new-shared-screen', areas)).toBe(true);
  });

  it('a kitchen is a shop in everything but the count: only the two count screens differ', () => {
    const differ = Object.keys(SCREENS).filter((r) => areaAllows(concrete(r), SHOP) !== areaAllows(concrete(r), KITCHEN));
    expect(differ.sort()).toEqual(['/stock/order', '/stock/report']);
    // …and the menu itself is NOT one of them: that is where a restaurant's dishes live.
    expect(areaAllows('/stock', KITCHEN)).toBe(true);
    expect(areaAllows('/orders/new', KITCHEN)).toBe(true);
  });
});
