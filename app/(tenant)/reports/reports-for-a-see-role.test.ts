import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gridCanSee } from '../lib/nav-policy';

/**
 * Jira GRW-709's first sweep (2026-11-14) — in a shop and a restaurant, a custom role with Reports at See was offered Reports in the
 * nav and sent Home when it tapped it. The shop report asked the member's kind (owner/manager); the API (`maySeeSales`) asks the role.
 */
const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const grid = (reports: 'none' | 'view' | 'manage') =>
  ({ bookings: 'view', clients: 'view', services: 'view', offers: 'view', staff: 'view', attendance: 'view', reports, settings: 'view' }) as const;

describe('a shop report for a role that holds Reports', () => {
  it('opens for any role whose grid can see Reports, as well as the owner and manager', () => {
    expect(page).toContain("const roleHoldsReports = !!pages && gridCanSee('/reports', pages);");
    expect(page).toContain('const mayOpenShopReports = areasOf(me).shop && (maySeeTheBooks || roleHoldsReports);');
  });

  it('asks the grid the same question the nav does: See opens it, none does not', () => {
    expect(gridCanSee('/reports', grid('view'))).toBe(true);
    expect(gridCanSee('/reports', grid('manage'))).toBe(true);
    expect(gridCanSee('/reports', grid('none'))).toBe(false);
  });

  it('leaves the salon\'s summary alone: the diary report still answers to maySeeTheBooks only', () => {
    expect(page).toContain('if (!noBookings && params.tab === undefined && maySeeTheBooks) {');
  });
});
