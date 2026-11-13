import type { PageGrid } from '../lib/areas';
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

/**
 * QA 2026-11-06 — the tokens that are still an order to hand over: the ones with something left on them.
 *
 * A fully returned order keeps its token NUMBER (the day's numbering counts it, so the next token and every later
 * one stay where the customers' slips say they are), but it has no dishes and no money left, so there is nothing to
 * deliver. It sat in the Queue as "Deliver first — Hand over" at ₹0 until somebody tapped it, and the tab badge
 * counted it. Home already left such an order out; this makes the POS agree.
 */
export function tokensStillOnTheBoard<T extends { items: readonly unknown[] }>(tokens: readonly T[]): T[] {
  return tokens.filter((tk) => tk.items.length > 0);
}

/**
 * QA 2026-11-06 — the token number of each of today's orders, the way the POS numbers them.
 *
 * A token is the order's place in the day: the first order rung up is #01, the next #02. It is what the customer's
 * receipt says and what the POS Queue shows, so it has to be the SAME number wherever the order is drawn. Home
 * drew its own: it counted only the orders it was about to show, so a fully returned order (which Home hides)
 * moved every later token down by one, and the number changed again each time an order left the list — Token 6 on
 * the receipt, #05 on Home.
 *
 * So the number is worked out over every order of the day that still counts as one — everything but a cancelled
 * order, a returned one included — in the order the POS sorts them; WHICH of them to show is decided afterwards.
 */
/**
 * Owner, 9 Nov 2026 — the token each order of the day carries.
 *
 * The number the API stored when the order was rung up (0174) is the order's number, full stop: a cancel or a return
 * of another order can never move it. Only an order the API gave no number — a visit that never had a token, or
 * every order from an API older than 0174 — is numbered here, in the order of the day, after the stored ones, so it
 * cannot take a number another order already has. With no stored numbers at all this is the old place-in-the-day.
 */
export function numberTheDay<T>(sortedOfTheDay: readonly T[], storedOf: (o: T) => number | null | undefined, keyOf: (o: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  let next = 0;
  for (const o of sortedOfTheDay) {
    const n = storedOf(o);
    if (typeof n === 'number' && n >= 1) {
      out.set(keyOf(o), n);
      next = Math.max(next, n);
    }
  }
  for (const o of sortedOfTheDay) {
    if (!out.has(keyOf(o))) out.set(keyOf(o), ++next);
  }
  return out;
}

export function tokenNumbersOf(
  orders: ReadonlyArray<{ id: string; soldAt: string; status?: string; tokenNo?: number | null }>,
  isToday: (ms: number) => boolean,
): Map<string, number> {
  const counted = orders
    .filter((o) => {
      if (o.status === 'cancelled' || o.status === 'no_show') return false;
      const ms = Date.parse(o.soldAt);
      return Number.isFinite(ms) && isToday(ms);
    })
    .sort((a, b) => {
      const ta = Date.parse(a.soldAt) || 0;
      const tb = Date.parse(b.soldAt) || 0;
      return ta !== tb ? ta - tb : a.id.localeCompare(b.id);
    });
  return numberTheDay(counted, (o) => o.tokenNo, (o) => o.id);
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

  // The leg that carries a token (a walk-in's is on its first leg; an order has one row) — see `numberTheDay`.
  const numbers = numberTheDay(visits, ([, legs]) => legs.find((l) => typeof l.tokenNo === 'number')?.tokenNo, ([key]) => key);

  return visits.map(([key, legs]) => {
    const first = legs[0]!;
    const tokenNo = numbers.get(key)!;
    const items: Array<{ name: string; qty: number; paidMinor: number }> = [];
    for (const leg of legs) {
      if (leg.serviceName) {
        const paid = Number(leg.paidAmountMinor ?? leg.priceMinor ?? 0);
        items.push({ name: leg.serviceName, qty: 1, paidMinor: paid });
      }
    }
    // Owner, 9 Nov 2026 — "Add items" writes its own lines onto the order, so the same dish added twice is one row here.
    const sameProduct = new Map<string, { name: string; qty: number; paidMinor: number }>();
    for (const p of first.products ?? []) {
      const netQty = p.qty - (p.returnedQty ?? 0);
      const netPaidMinor = Math.max(0, Number(p.paidMinor ?? 0) - Number(p.returnedMinor ?? 0));
      if (netQty <= 0) continue;
      const key = `${p.productId ?? ''}|${p.variantId ?? ''}|${p.name}`;
      const seen = sameProduct.get(key);
      if (seen) {
        seen.qty += netQty;
        seen.paidMinor += netPaidMinor;
      } else {
        const row = { name: p.name, qty: netQty, paidMinor: netPaidMinor };
        sameProduct.set(key, row);
        items.push(row);
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
 * A member who HOLDS a role (Jira GRW-73) is judged by the role grid. Owner, 2026-11-13 (QA bug 6) — a manager takes returns: the route is the
 * grid's Reports `manage` (`route-pages.ts`, shared 1.0.37), so a role that can change Reports may, and any other may not. Pass the grid itself;
 * `true` without one (an older caller) still closes it.
 */
export function mayTakeReturns(role: MemberRole | null | undefined, reportTabs?: readonly string[], holdsRole: boolean | PageGrid | null = false): boolean {
  if (holdsRole && typeof holdsRole === 'object') return holdsRole.reports === 'manage';
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
