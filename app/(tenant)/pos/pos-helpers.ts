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
export type PosTokenOverride = PosTokenState | `preparing:${number}`;

export interface PosDailyToken {
  id: string;
  tokenNo: number;
  tokenLabel: string;
  startAt: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  channel: string;
  paymentMode: string | null;
  paymentPending: boolean;
  totalMinor: number;
  items: Array<{ name: string; qty: number; paidMinor: number }>;
  itemsSummary: string;
  state: PosTokenState;
  /** Owner, 4 Nov 2026 — when the shop handed it over, as the server knows it; null while it waits. */
  handedOverAt: string | null;
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
  overrides: Readonly<Record<string, PosTokenOverride>> = {},
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
      const netQty = p.qty - (p.returnedQty ?? 0);
      const netPaidMinor = Math.max(0, Number(p.paidMinor ?? 0) - Number(p.returnedMinor ?? 0));
      if (netQty > 0) {
        items.push({ name: p.name, qty: netQty, paidMinor: netPaidMinor });
      }
    }
    const totalMinor = items.reduce((sum, item) => sum + item.paidMinor, 0);
    const itemsSummary = items.map((i) => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(', ');
    const startMs = Date.parse(first.startAt) || nowMs;
    const rawOverride = overrides[key];
    const recalledMs =
      typeof rawOverride === 'string' && rawOverride.startsWith('preparing:')
        ? Number(rawOverride.slice(10))
        : NaN;
    const effectiveStartMs = Number.isFinite(recalledMs) && recalledMs > 0 ? recalledMs : startMs;
    const elapsedMin = Math.max(0, Math.round((nowMs - effectiveStartMs) / 60_000));
    const isProductSale = !first.serviceName && !first.serviceId && first.channel !== undefined;
    const channel = first.channel ?? 'counter';
    const paymentMode = first.paymentMode ?? null;
    const paymentPending = isProductSale && channel === 'counter' && (first.paymentPending ?? paymentMode === null);
    const defaultState: PosTokenState = paymentPending || elapsedMin <= 30 ? 'preparing' : 'completed';
    /*
     * Owner, 4 Nov 2026 — the SHOP's answer first, then this device's.
     *
     * Handing an order over was a flag in this browser's `localStorage` and nowhere else, so two people on one
     * account saw two different queues all day: the one who tapped it cleared the token, the other kept it for
     * ever. `handedOverAt` comes from the server, so a handover is now the same answer on every phone.
     *
     * Only when it is SET. A null is not "still waiting" — it is "nobody recorded it", which is every order rung
     * up before the column existed. Reading null as waiting put a whole day's finished orders back in the queue
     * (23 of them, on the first run of this). So null falls through to what this screen did before: the local
     * flag, else the thirty-minute default. The direction that matters — somebody handed it over — is shared;
     * the other direction is this device's own until the server knows better.
     */
    const handedOverAt = first.handedOverAt ?? null;
    const state: PosTokenState =
      (handedOverAt ? 'completed' : null) ??
      (!paymentPending && rawOverride === 'completed'
        ? 'completed'
        : rawOverride === 'preparing' || (typeof rawOverride === 'string' && rawOverride.startsWith('preparing:'))
          ? 'preparing'
          : defaultState);

    return {
      id: key,
      tokenNo,
      tokenLabel: formatTokenNo(tokenNo),
      startAt: first.startAt,
      customerId: first.customerId ?? null,
      customerName: first.customerName?.trim() || '',
      customerPhone: first.customerPhone ?? null,
      channel,
      paymentMode,
      paymentPending,
      totalMinor,
      items,
      itemsSummary,
      state,
      handedOverAt,
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
