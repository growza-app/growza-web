import type { MemberRole } from '../lib/nav-policy';

/**
 * The POS tab has two jobs: ring a sale up, and take a product back onto the shelf.
 *
 * Sell is open to everyone who may open the till. Return is open to exactly the people the API lets call
 * `POST /api/v1/sales/:visitKey/returns` — the owner and manager, and a front desk only when the owner has opened the
 * Sales tab to them (`ROUTE_TAB` in `src/api/security/report-access.ts`). Drawing a Return mode for anyone else would
 * be a screen whose every tap answers 403.
 */
export type PosMode = 'sell' | 'return';

/**
 * A session with no role reads as the owner, as everywhere else: a degraded `/me` is not a reason to hide the till.
 *
 * A member who HOLDS a role (Jira GRW-73) is judged by the role grid, and the grid never grants a refund: `POST /api/v1/sales/:visitKey/returns` is
 * the owner's alone for a role holder (`route-pages.ts`), however much of Bookings they hold. So `holdsRole` closes it, whatever fixed role they work like.
 */
export function mayTakeReturns(role: MemberRole | null | undefined, reportTabs?: readonly string[], holdsRole = false): boolean {
  if (holdsRole) return false;
  if (role == null || role === 'owner' || role === 'manager') return true;
  if (role === 'receptionist') return Boolean(reportTabs?.includes('sales'));
  return false;
}

/** `?mode=return` opens Return, but only for someone who may use it; anything else is the register's front door, Sell. */
export function posModeOf(raw: string | undefined, canReturn: boolean): PosMode {
  return raw === 'return' && canReturn ? 'return' : 'sell';
}

/**
 * The first day of sales Return looks back over: at least the 60 days the Sales register loads, and the whole return
 * window when the business has set it longer. Days are `YYYY-MM-DD` in the business's own zone.
 */
export function returnLookbackFrom(todayISO: string, returnWindowDays: number): string {
  const days = Math.max(59, Math.trunc(returnWindowDays) || 0);
  const ms = Date.parse(`${todayISO}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
