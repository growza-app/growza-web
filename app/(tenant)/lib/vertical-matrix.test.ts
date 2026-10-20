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
const SHOP: Areas = { bookings: false, services: false, shop: true };
const SHAPES: Array<{ name: string; areas: Areas }> = [
  { name: 'diary (salon, clinic, spa, garage, dental)', areas: DIARY_AREAS },
  { name: 'shop (retail)', areas: SHOP },
];
const ROLES: Array<MemberRole | null> = ['owner', 'manager', 'receptionist', 'staff', null];

type Who = 'both' | 'diary' | 'shop';
/** The screen → who has it. The one hand-written thing here; everything else is derived or asked. */
const SCREENS: Readonly<Record<string, Who>> = {
  '/': 'both',
  '/[...rest]': 'both',
  '/appointments': 'diary',
  '/appointments/new': 'diary',
  '/attendance': 'diary',
  '/attendance/[providerId]': 'diary',
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
  '/orders/import': 'shop',
  '/orders/new': 'shop',
  '/packages': 'diary',
  '/packages/[id]/edit': 'diary',
  '/packages/new': 'diary',
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
  '/settings/check-in': 'diary',
  '/settings/gst': 'both',
  '/settings/notifications': 'both',
  '/settings/payments': 'both',
  '/settings/profile': 'both',
  '/settings/report-access': 'both',
  '/settings/team': 'both',
  '/settings/working-hours': 'both',
  '/stock': 'shop',
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
const hasIt = (who: Who, shape: 'diary' | 'shop') => who === 'both' || who === shape;

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
  for (const { name, areas } of SHAPES) {
    const shape = areas.shop ? 'shop' : 'diary';
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

  it('a sixth shape is one entry: a screen added with who=both is allowed in every shape', () => {
    for (const { areas } of SHAPES) expect(areaAllows('/a-new-shared-screen', areas)).toBe(true);
  });
});
