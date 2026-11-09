import type { CustomerStats } from './api-types';

/**
 * Owner, 9 Nov 2026 — Home's Customers (Clients, Patients…) counts only people who have PAID: a settled bill or a
 * completed visit. Someone the desk added for an order that was then cancelled, or who has only booked, is on the
 * book (the Customers screen still lists them, under "never been in") but is not a customer of the business yet.
 *
 * `neverVisited` is the stats' own "no paid bill, no completed visit" count (`SALE_IS_VISIT`, `lastVisitAt` in the
 * API's platform/segments.ts), so this is the same rule the Customers screen's bands use — not a second copy of it.
 */
export function paidCustomers(stats: Pick<CustomerStats, 'total' | 'neverVisited'> | null | undefined): number | null {
  if (!stats) return null;
  return Math.max(0, stats.total - stats.neverVisited);
}
