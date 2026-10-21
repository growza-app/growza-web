import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canSee, gridCanSee } from './nav-policy';
import { areasOf, DIARY_AREAS, type PageGrid } from './areas';

/**
 * Jira GRW-74 — the dashboard offers a member who holds a role what the role grants, and nothing is asked of the fixed role they work like.
 * This is the courtesy half (the API is the boundary, `grid-enforcement.integration.test.ts`): a link a role cannot open is absent, not greyed.
 */
const SHOP = { ...DIARY_AREAS, bookings: false, services: false, shop: true };
const withGrid = (pages: PageGrid) => ({ ...SHOP, pages });
const DESK: PageGrid = { bookings: 'manage', clients: 'manage', services: 'manage', attendance: 'view' };
const STAFF: PageGrid = { attendance: 'view' };

describe('the nav follows the role’s pages', () => {
  it('a Desk role is offered Orders, Clients and Stock, and not Reports or Settings or Offers', () => {
    const areas = withGrid(DESK);
    expect(canSee('/orders', 'receptionist', undefined, true, areas)).toBe(true);
    expect(canSee('/customers', 'receptionist', undefined, true, areas)).toBe(true);
    expect(canSee('/stock', 'receptionist', undefined, true, areas)).toBe(true);
    expect(canSee('/reports', 'receptionist', undefined, true, areas)).toBe(false);
    expect(canSee('/settings', 'receptionist', undefined, true, areas)).toBe(false);
  });

  it('a page at None is absent, at See or Change is present', () => {
    expect(gridCanSee('/reports', { reports: 'none' })).toBe(false);
    expect(gridCanSee('/reports', { reports: 'view' })).toBe(true);
    expect(gridCanSee('/reports', { reports: 'manage' })).toBe(true);
    expect(gridCanSee('/reports', {})).toBe(false);
  });

  it('a Staff role (attendance only) still has Home, the menu, notifications and help', () => {
    const areas = withGrid(STAFF);
    for (const href of ['/', '/more', '/notifications', '/help']) expect(canSee(href, 'staff', undefined, true, areas), href).toBe(true);
    expect(canSee('/orders', 'staff', undefined, true, areas)).toBe(false);
  });

  it('a manager-like role is offered by the grid too, not by the owner-like default', () => {
    expect(canSee('/reports', 'manager', undefined, true, withGrid({ reports: 'none', settings: 'manage' }))).toBe(false);
    expect(canSee('/settings', 'manager', undefined, true, withGrid({ settings: 'manage' }))).toBe(true);
  });

  it('a sub-screen follows its page (Roles is Settings)', () => {
    expect(gridCanSee('/settings/roles', { settings: 'view' })).toBe(true);
    expect(gridCanSee('/products/sell', { bookings: 'manage' })).toBe(true);
    expect(gridCanSee('/products', { bookings: 'manage' })).toBe(false);
  });

  it('the business still has to be live: a role does not open a setup-only business', () => {
    expect(canSee('/orders', 'receptionist', undefined, false, withGrid(DESK))).toBe(false);
  });
});

describe('who gets a grid at all', () => {
  const me = (member: { role: string; tenantRoleId?: string | null } | null) => ({ surface: 'shop', member, permissions: DESK });
  it('a member who holds a role does', () => {
    expect(areasOf(me({ role: 'receptionist', tenantRoleId: 'r1' })).pages).toEqual(DESK);
  });
  it('the owner never does, even with a role id', () => {
    expect(areasOf(me({ role: 'owner', tenantRoleId: 'r1' })).pages).toBeUndefined();
  });
  it('a member with no role does not: they are offered what their fixed role always was', () => {
    expect(areasOf(me({ role: 'receptionist', tenantRoleId: null })).pages).toBeUndefined();
    expect(canSee('/orders', 'receptionist', ['sales'], true, areasOf(me({ role: 'receptionist', tenantRoleId: null })))).toBe(true);
  });
  it('a degraded session with no member does not', () => {
    expect(areasOf(me(null)).pages).toBeUndefined();
  });
});

describe('the direct address', () => {
  it('the screen guard sends a page the role does not open Home, before any data is asked for', () => {
    const guard = readFileSync(join(__dirname, 'screen-guard.ts'), 'utf8');
    expect(guard).toContain("if (areas.pages && !gridCanSee(href, areas.pages)) redirect('/');");
    // guardScreen asks canSee with the same areas object, which carries the grid.
    expect(guard).toContain('canSee(href, role, reportTabs, true, areas)');
  });
});
