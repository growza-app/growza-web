import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { canSee } from '../../lib/nav-policy';
import { areaAllows, DIARY_AREAS, type Areas } from '../../lib/areas';

/**
 * Owner, 2026-11-14 — Profit, Discounts & free and Payments: three more Reports tabs for a business that sells over a
 * counter. Who is offered them, where they sit, and that Hindi says everything English does.
 */
const SHOP: Areas = { bookings: false, services: false, shop: true, stock: true };
const KITCHEN: Areas = { bookings: false, services: false, shop: true, stock: false };
const TABS = ['/reports/profit', '/reports/payments', '/reports/discounts'];
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

const keysOf = (o: unknown, at = ''): string[] =>
  typeof o === 'object' && o !== null ? Object.entries(o).flatMap(([k, v]) => keysOf(v, at ? `${at}.${k}` : k)) : [at];

describe('who is offered the three tabs', () => {
  it('a shop and a kitchen have them; a salon does not, by address or by tab', () => {
    for (const href of TABS) {
      expect(areaAllows(href, SHOP)).toBe(true);
      expect(areaAllows(href, KITCHEN)).toBe(true);
      expect(areaAllows(href, DIARY_AREAS)).toBe(false);
    }
  });

  it('the owner and manager open them; the front desk and staff do not — it is money', () => {
    for (const href of TABS) {
      expect(canSee(href, 'owner', undefined, true, SHOP)).toBe(true);
      expect(canSee(href, 'manager', undefined, true, SHOP)).toBe(true);
      expect(canSee(href, 'receptionist', ['revenue'], true, SHOP)).toBe(false);
      expect(canSee(href, 'staff', undefined, true, SHOP)).toBe(false);
    }
  });

  it('a role holder needs Reports in the grid', () => {
    const grid = (reports: 'none' | 'view') => ({ ...SHOP, pages: { bookings: 'manage', clients: 'manage', services: 'manage', reports } as const });
    expect(canSee('/reports/profit', 'receptionist', undefined, true, grid('view'))).toBe(true);
    expect(canSee('/reports/profit', 'receptionist', undefined, true, grid('none'))).toBe(false);
  });
});

describe('where they sit', () => {
  it('right after the summary on the report tab bar, each page guarding its own address', () => {
    const nav = src('../../components/RetailReportsNav.tsx');
    expect(nav.indexOf("href: '/reports/profit'")).toBeGreaterThan(nav.indexOf("href: '/reports'"));
    expect(nav.indexOf("href: '/reports/discounts'")).toBeLessThan(nav.indexOf("href: '/stock/channels'"));
    for (const k of ['profit', 'payments', 'discounts']) expect(src(`../${k}/page.tsx`)).toContain(`await guardScreen('/reports/${k}');`);
  });

  it('an order is linked only where the reader may open Orders', () => {
    for (const f of ['./DiscountReport.tsx', './PaymentsReport.tsx']) expect(src(f)).toContain("const ordersOpen = mayOpen('/orders');");
  });
});

describe('Hindi', () => {
  it('has every sentence English has, and no other', () => {
    expect(keysOf((hi as Record<string, unknown>).moneyReports).sort()).toEqual(keysOf((en as Record<string, unknown>).moneyReports).sort());
  });

  it('is sent to the browser', () => {
    expect(src('../../../../i18n/client-messages.ts')).toContain("'moneyReports'");
  });
});
