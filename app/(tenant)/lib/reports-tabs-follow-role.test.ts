import { describe, expect, it } from 'vitest';
import type { Areas } from './areas';
import { canSee, SHOP_REPORT_SCREENS } from './nav-policy';

/**
 * Jira GRW-754 — Reports tabs follow the person's role: nobody sees a tab that sends them back Home.
 *
 * The four report screens kept at Stock and Orders addresses are money. A fixed role opens them as owner or manager only;
 * a custom role opens them when its grid opens Reports — whatever it holds of the menu or of Orders. The tab bar and each
 * page's guard ask this same `canSee`, so a chip is drawn exactly when its screen opens.
 */
const KITCHEN: Areas = { bookings: false, services: false, shop: true, stock: false, tables: true, recipes: true };
const withGrid = (pages: NonNullable<Areas['pages']>): Areas => ({ ...KITCHEN, pages });

describe('a fixed role', () => {
  it.each(SHOP_REPORT_SCREENS)('%s — the owner and the manager, and nobody else', (href) => {
    expect(canSee(href, 'owner', undefined, true, KITCHEN)).toBe(true);
    expect(canSee(href, 'manager', undefined, true, KITCHEN)).toBe(true);
    expect(canSee(href, 'receptionist', ['revenue'], true, KITCHEN)).toBe(false);
    expect(canSee(href, 'staff', undefined, true, KITCHEN)).toBe(false);
  });

  it('the front desk still has Orders itself: only the money under it is closed', () => {
    expect(canSee('/orders', 'receptionist', undefined, true, KITCHEN)).toBe(true);
    expect(canSee('/orders/returns', 'receptionist', undefined, true, KITCHEN)).toBe(false);
  });
});

describe('a custom role (AC-01, AC-02)', () => {
  it.each(SHOP_REPORT_SCREENS)('%s — a "Head waiter" given Reports opens it', (href) => {
    expect(canSee(href, 'receptionist', undefined, true, withGrid({ reports: 'view', bookings: 'manage' }))).toBe(true);
  });

  it.each(SHOP_REPORT_SCREENS)('%s — a role with the menu and Orders but not Reports does not', (href) => {
    expect(canSee(href, 'receptionist', undefined, true, withGrid({ services: 'manage', bookings: 'manage' }))).toBe(false);
  });

  it('Reports alone opens Sales by channel and Top sellers without the menu page', () => {
    const grid = withGrid({ reports: 'view' });
    expect(canSee('/stock/channels', 'receptionist', undefined, true, grid)).toBe(true);
    expect(canSee('/stock/sellers', 'receptionist', undefined, true, grid)).toBe(true);
    // The menu itself stays the menu page's.
    expect(canSee('/stock', 'receptionist', undefined, true, grid)).toBe(false);
  });

  it('a business that does not have the screen never offers it, whoever asks', () => {
    const diary: Areas = { bookings: true, services: true, shop: false, stock: false };
    for (const href of SHOP_REPORT_SCREENS) expect(canSee(href, 'owner', undefined, true, diary)).toBe(false);
  });
});
