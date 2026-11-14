import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canSee } from './nav-policy';
import type { Areas, PageGrid } from './areas';

/**
 * Jira GRW-709's every-role sweep (2026-11-14) — seven links, each drawn for a person the screen behind it sends Home.
 * Every one is now asked the question that screen's guard asks (`canSee`, through `useMayOpen` in a client component),
 * so a link is drawn only where it opens. The first half proves the answers; the second that each link asks.
 */
const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const RESTAURANT: Areas = { bookings: false, services: false, shop: true, stock: false };
const RETAIL: Areas = { bookings: false, services: false, shop: true, stock: true };
const SALON: Areas = { bookings: true, services: true, shop: false, stock: true };
const withGrid = (areas: Areas, pages: PageGrid): Areas => ({ ...areas, pages });
const ALL = (level: 'view' | 'manage'): PageGrid => ({ bookings: level, clients: level, services: level, offers: level, staff: level, attendance: level, reports: level, settings: level });

describe('the answers each link now asks for', () => {
  it('bug 2 — a kitchen has no stock report or reorder list; a shop does', () => {
    for (const href of ['/stock/order', '/stock/report']) {
      expect(canSee(href, 'owner', undefined, true, RESTAURANT)).toBe(false);
      expect(canSee(href, 'owner', undefined, true, RETAIL)).toBe(true);
    }
  });

  it('bugs 3 and 8 — Branches and Billing are the owner\'s, whatever grid a manager holds', () => {
    for (const href of ['/settings/branches', '/settings/billing']) {
      expect(canSee(href, 'owner', undefined, true, RETAIL)).toBe(true);
      expect(canSee(href, 'manager', undefined, true, withGrid(RETAIL, ALL('manage')))).toBe(false);
      expect(canSee(href, 'manager', undefined, true, withGrid(RETAIL, ALL('view')))).toBe(false);
    }
  });

  it('bugs 4 and 5 — Orders needs Reports as well as Bookings; Customers needs Clients', () => {
    const desk = withGrid(RETAIL, { ...ALL('manage'), reports: 'none' });
    expect(canSee('/orders', 'receptionist', undefined, true, desk)).toBe(false);
    expect(canSee('/customers', 'receptionist', undefined, true, withGrid(RESTAURANT, { ...ALL('manage'), clients: 'none' }))).toBe(false);
    expect(canSee('/orders', 'owner', undefined, true, RETAIL)).toBe(true);
  });

  it('bug 6 — a salon front desk does not open Products', () => {
    expect(canSee('/products', 'receptionist', undefined, true, SALON)).toBe(false);
    expect(canSee('/products', 'owner', undefined, true, SALON)).toBe(true);
  });

  it('bug 7 — the till is a write: a role at See is not offered it, and the answer needs the areas that carry the grid', () => {
    const viewOnly = withGrid(SALON, ALL('view'));
    expect(canSee('/products/sell', 'receptionist', undefined, true, viewOnly)).toBe(false);
    // Asked WITHOUT the areas — what Home did — the grid is never consulted and the fixed role says yes.
    expect(canSee('/products/sell', 'receptionist')).toBe(true);
  });
});

describe('each link asks before it is drawn', () => {
  it('bug 2 — Top sellers\' two buttons', () => {
    const s = src('../stock/sellers/SellersClient.tsx');
    expect(s).toContain("mayOpen('/stock/order') ? (");
    expect(s).toContain("mayOpen('/stock/report') ? (");
  });

  it('bug 3 — Business profile\'s Addresses card', () => {
    expect(src('../settings/profile/ProfileForm.tsx')).toContain("const mayOpenBranches = useMayOpen()('/settings/branches');");
  });

  it('bug 4 — a restaurant Home\'s Orders and Customers tiles', () => {
    const s = src('../components/home/ShopHome.tsx');
    expect(s).toContain("href={can('/orders') ? '/orders' : undefined}");
    expect(s).toContain("href={can('/customers') ? '/customers' : undefined}");
  });

  it('bug 5 — the client card\'s See orders button', () => {
    expect(src('../components/ClientProfileCard.tsx')).toContain("const history = place && mayOpen(place.href.split('?')[0]!) ?");
  });

  it('bug 6 — Help\'s What\'s new lines', () => {
    expect(src('../help/WhatsNew.tsx')).toContain('{thing.href && mayOpen(thing.href) ? (');
    expect(src('../help/page.tsx')).toContain('mayOpen = (href) => canSee(href, memberRole, me.reportTabs, true, areas);');
  });

  it('bug 7 — the salon Home\'s quick links and cards pass the areas', () => {
    const s = src('../components/home/OwnerHome.tsx');
    expect(s).toContain('].filter((l) => canSee(l.href, p.role, p.reportTabs, true, areas));');
    expect(s).toContain('const mayOpen = (href: string) => canSee(href, p.role, p.reportTabs, true, areas);');
  });

  it('bug 7 — the front-desk Home\'s tiles ask with the role\'s grid, not of the fixed front desk', () => {
    const s = src('../components/home/ReceptionHome.tsx');
    expect(s).toContain("...(mayOpen('/products/sell') ? [");
    expect(s).not.toContain("canSee('/products/sell', 'receptionist')");
  });

  it('bug 8 — a notification links only where its reader may go', () => {
    expect(src('../components/NotificationBell.tsx')).toContain("const href = target && mayOpen(target.split('?')[0]!) ? target : null;");
  });

  it('the session carries the Reports tabs, so a link asks exactly what the guard asks', () => {
    expect(src('../layout.tsx')).toMatch(/timezone,\n\s+reportTabs,\n\s+\}\}/);
  });
});
