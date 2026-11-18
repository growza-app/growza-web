import { describe, expect, it } from 'vitest';
import { cooksOnly, servesTablesOnly, type PageGrid } from './areas';

/**
 * Develop QA 2026-11-18 (test:roles) — "Everything view-only" was taken for a waiter: Tables granted and no Change on Bookings was the
 * whole test, so every address sent that role to the till and its sidebar was POS alone. A waiter and a cook are also roles that open
 * none of the office's screens.
 */
const EVERYTHING_VIEW: PageGrid = {
  bookings: 'view', clients: 'view', services: 'view', offers: 'view', staff: 'view', attendance: 'view', reports: 'view', settings: 'view', tables: 'view', kitchen: 'view',
};

describe('who is a waiter, and who is a cook', () => {
  it('the restaurant’s Waiter template is a waiter; its Kitchen template is a cook', () => {
    expect(servesTablesOnly({ tables: 'manage' })).toBe(true);
    expect(cooksOnly({ kitchen: 'manage' })).toBe(true);
  });

  it('a waiter or cook who may also see their own attendance stays one', () => {
    expect(servesTablesOnly({ tables: 'manage', attendance: 'view' })).toBe(true);
    expect(cooksOnly({ kitchen: 'manage', attendance: 'view' })).toBe(true);
  });

  it('a role that sees every page is neither — it is offered every page at See', () => {
    expect(servesTablesOnly(EVERYTHING_VIEW)).toBe(false);
    expect(cooksOnly(EVERYTHING_VIEW)).toBe(false);
  });

  it('one office page is enough to stop being a waiter or a cook', () => {
    for (const page of ['clients', 'services', 'offers', 'staff', 'reports', 'settings'] as const) {
      expect(servesTablesOnly({ tables: 'manage', [page]: 'view' }), page).toBe(false);
      expect(cooksOnly({ kitchen: 'manage', [page]: 'view' }), page).toBe(false);
    }
  });

  it('the counter (Bookings at Change) is neither, as before', () => {
    expect(servesTablesOnly({ tables: 'manage', bookings: 'manage' })).toBe(false);
    expect(cooksOnly({ kitchen: 'manage', bookings: 'manage' })).toBe(false);
  });
});
