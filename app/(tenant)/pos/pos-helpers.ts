import type { Appointment } from '../lib/api-types';
import type { MemberRole } from '../lib/nav-policy';

/**
 * The POS tab has three modes:
 * - `sell`: ring a sale up (with a live kitchen token strip above the grid)
 * - `queue`: track today's active tokens in queue vs completed today
 * - `return`: take a product back onto the shelf
 *
 * Sell and Queue are open to everyone who may open the till. Return is open to exactly the people the API lets call
 * `POST /api/v1/sales/:visitKey/returns` — the owner and manager, and a front desk only when the owner has opened the
 * Sales tab to them (`ROUTE_TAB` in `src/api/security/report-access.ts`). Drawing a Return mode for anyone else would
 * be a screen whose every tap answers 403.
 */
export type PosMode = 'sell' | 'queue' | 'return';

export type PosTokenState = 'preparing' | 'completed';

export interface PosDailyToken {
  id: string;
  tokenNo: number;
  tokenLabel: string;
  startAt: string;
  customerName: string;
  channel: string;
  paymentMode: string | null;
  totalMinor: number;
  items: Array<{ name: string; qty: number; paidMinor: number }>;
  itemsSummary: string;
  state: PosTokenState;
  elapsedMin: number;
}

/** Formats daily token number as `#01`..`#99`, `#100`+. */
export function formatTokenNo(n: number): string {
  return `#${String(Math.max(1, Math.trunc(n))).padStart(2, '0')}`;
}

/** Storage key for today's token queue state at a branch; includes `todayISO` so it resets each new day. */
export function posQueueStorageKey(locationId: string | null | undefined, todayISO: string): string {
  return `growza.pos.queue.${locationId ?? 'all'}.${todayISO}`;
}

/**
 * Builds today's sequential daily tokens (`#01`, `#02`, …) for the chosen branch from today's appointments/sales.
 * Recent orders (within 30 minutes) default to `'preparing'` unless explicitly marked `'completed'` in `overrides`.
 */
export function buildDailyTokens(
  rows: readonly Appointment[],
  locationId: string | null | undefined,
  overrides: Readonly<Record<string, PosTokenState>> = {},
  nowMs: number = Date.now(),
): PosDailyToken[] {
  const filtered = rows.filter((r) => {
    if (r.status === 'cancelled' || r.status === 'no_show') return false;
    if (locationId && r.locationId && r.locationId !== locationId) return false;
    return (r.products?.length ?? 0) > 0 || Boolean(r.serviceName);
  });

  // Group multi-leg appointments by bookingGroupId or id so each order gets one token
  const byVisit = new Map<string, Appointment[]>();
  for (const r of filtered) {
    const key = r.bookingGroupId ?? r.id;
    const list = byVisit.get(key);
    if (list) list.push(r);
    else byVisit.set(key, [r]);
  }

  const visits = [...byVisit.entries()].sort((a, b) => {
    const ta = Date.parse(a[1][0]!.startAt) || 0;
    const tb = Date.parse(b[1][0]!.startAt) || 0;
    return ta !== tb ? ta - tb : a[0].localeCompare(b[0]);
  });

  return visits.map(([key, legs], idx) => {
    const first = legs[0]!;
    const tokenNo = idx + 1;
    const items: Array<{ name: string; qty: number; paidMinor: number }> = [];
    for (const leg of legs) {
      if (leg.serviceName) {
        const paid = Number(leg.paidAmountMinor ?? leg.priceMinor ?? 0);
        items.push({ name: leg.serviceName, qty: 1, paidMinor: paid });
      }
    }
    for (const p of first.products ?? []) {
      if (p.qty > 0) {
        items.push({ name: p.name, qty: p.qty, paidMinor: Number(p.paidMinor ?? 0) });
      }
    }
    const totalMinor = items.reduce((sum, item) => sum + item.paidMinor, 0);
    const itemsSummary = items.map((i) => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(', ');
    const startMs = Date.parse(first.startAt) || nowMs;
    const elapsedMin = Math.max(0, Math.round((nowMs - startMs) / 60_000));
    const defaultState: PosTokenState = elapsedMin <= 30 ? 'preparing' : 'completed';
    const state: PosTokenState = overrides[key] ?? defaultState;

    return {
      id: key,
      tokenNo,
      tokenLabel: formatTokenNo(tokenNo),
      startAt: first.startAt,
      customerName: first.customerName?.trim() || '',
      channel: first.channel ?? 'counter',
      paymentMode: first.paymentMode ?? null,
      totalMinor,
      items,
      itemsSummary,
      state,
      elapsedMin,
    };
  });
}

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

/** `?mode=return` opens Return, but only for someone who may use it; `?mode=queue` opens Queue; anything else is Sell. */
export function posModeOf(raw: string | undefined, canReturn: boolean): PosMode {
  if (raw === 'return' && canReturn) return 'return';
  if (raw === 'queue') return 'queue';
  return 'sell';
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
