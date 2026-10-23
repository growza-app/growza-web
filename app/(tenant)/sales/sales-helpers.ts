import type { VisitProductLine } from '../lib/api-types';

/**
 * Date range, CSV export, and Product Return helpers for the Sales register (/sales).
 * Extracted into a plain module so Server Components (`page.tsx`), Client Components
 * (`SalesClient.tsx`, `ReturnProductSheet.tsx`), and unit tests can share them cleanly.
 */

export const MAX_SALES_DATE_YEARS = 5;
export const MAX_SALES_EXPORT_ROWS = 5000;
export const DEFAULT_PRODUCT_RETURN_WINDOW_DAYS = 7;

/**
 * Computes the earliest selectable date (`minISO`, 5 calendar years before `todayISO`)
 * and clamps `[fromISO, toISO]` so the date range is never older than 5 years or after `todayISO`.
 */
export function clampSalesDateRange(
  fromISO: string,
  toISO: string,
  todayISO: string,
  maxYears = MAX_SALES_DATE_YEARS,
): { fromISO: string; toISO: string; minISO: string; maxISO: string } {
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const maxISO = isoRe.test(todayISO) ? todayISO : new Date().toISOString().slice(0, 10);
  const [y = 2026, m = 1, d = 1] = maxISO.split('-').map(Number);
  const minYear = y - maxYears;
  const maxDayInMonth = new Date(Date.UTC(minYear, m, 0)).getUTCDate();
  const minISO = new Date(Date.UTC(minYear, m - 1, Math.min(d, maxDayInMonth))).toISOString().slice(0, 10);

  let safeFrom = isoRe.test(fromISO) ? fromISO : maxISO;
  if (safeFrom < minISO) safeFrom = minISO;
  if (safeFrom > maxISO) safeFrom = maxISO;

  let safeTo = isoRe.test(toISO) ? toISO : safeFrom;
  if (safeTo < safeFrom) safeTo = safeFrom;
  if (safeTo > maxISO) safeTo = maxISO;

  return { fromISO: safeFrom, toISO: safeTo, minISO, maxISO };
}

export interface ReturnWindowState {
  eligible: boolean;
  daysElapsed: number;
  daysLeft: number;
  windowDays: number;
}

/**
 * Checks whether a bill from `saleDayISO` (`YYYY-MM-DD`) is within the business's
 * configurable product return window (`windowDays`, default 7 days) relative to `todayISO`.
 */
export function computeReturnWindow(
  saleDayISO: string,
  todayISO: string,
  windowDays = DEFAULT_PRODUCT_RETURN_WINDOW_DAYS,
): ReturnWindowState {
  const safeWindow = Math.max(0, Math.trunc(windowDays));
  const saleMs = Date.parse(`${saleDayISO}T00:00:00Z`);
  const todayMs = Date.parse(`${todayISO}T00:00:00Z`);
  const daysElapsed =
    Number.isFinite(saleMs) && Number.isFinite(todayMs)
      ? Math.max(0, Math.floor((todayMs - saleMs) / 86_400_000))
      : 0;
  const eligible = daysElapsed <= safeWindow;
  const daysLeft = eligible ? Math.max(0, safeWindow - daysElapsed) : 0;
  return { eligible, daysElapsed, daysLeft, windowDays: safeWindow };
}

/** Converts a `BookingGroup.key` (`<groupId>` or `single:<appointmentId>`) to the API `visitKey` UUID. */
export function visitKeyFromGroupKey(key: string): string {
  return key.startsWith('single:') ? key.slice(7) : key;
}

/**
 * Stable identifier for a `visit_product` line when calling `POST /api/v1/sales/:visitKey/returns`.
 *
 * Jira GRW-603 — a line that sold a SIZE is named by its own id: "the shirt" does not say which size comes back, and the
 * server refuses the style's id for it. A line for a product with no sizes is named by its product, exactly as before.
 */
export function lineReturnId(p: VisitProductLine): string {
  if (p.variantId) return p.id ?? p.name;
  return p.productId ?? p.id ?? p.name;
}

/** Remaining returnable units on a `visit_product` line (`qty - returnedQty`). */
export function lineRemainingQty(p: VisitProductLine): number {
  const sold = Math.max(0, Number(p.qty || 0));
  const returned = Math.max(0, Number(p.returnedQty || 0));
  return Math.max(0, sold - returned);
}

/** Net amount (in paise) still kept on a `visit_product` line (`paidMinor - returnedMinor`). */
export function lineNetPaidMinor(p: VisitProductLine): number {
  const paid = Math.max(0, Number(p.paidMinor || 0));
  const returned = Math.max(0, Number(p.returnedMinor || 0));
  return Math.max(0, paid - returned);
}

/**
 * Computes the exact refund in paise for returning `returnQty` units of `p`,
 * matching the API's proportional + exact-remainder math in `src/modules/booking/product-return.ts`.
 */
export function lineRefundMinorForQty(p: VisitProductLine, returnQty: number): number {
  const qty = Math.max(0, Math.trunc(returnQty));
  const remaining = lineRemainingQty(p);
  if (qty <= 0 || remaining <= 0) return 0;
  const clamped = Math.min(qty, remaining);
  const paidMinor = Math.max(0, Number(p.paidMinor || 0));
  const prevReturnedMinor = Math.max(0, Number(p.returnedMinor || 0));
  const remMinor = Math.max(0, paidMinor - prevReturnedMinor);
  if (clamped === remaining) {
    return remMinor;
  }
  return Math.max(0, Math.round((remMinor * clamped) / remaining));
}

export type RefundMode = 'cash' | 'card' | 'upi' | 'other';
export const REFUND_MODES: readonly RefundMode[] = ['cash', 'upi', 'card', 'other'];

/** The way a refund most likely goes back: the way the bill was paid, when it was paid one way we know; otherwise cash. */
export function defaultRefundMode(paymentModes: readonly string[] | undefined): RefundMode {
  const first = paymentModes?.[0];
  return first === 'cash' || first === 'upi' || first === 'card' ? first : first ? 'other' : 'cash';
}

/** A request id for one return. `crypto.randomUUID` needs a secure context; the fallback is only ever for an http dev box. */
export function newRequestId(): string {
  const c = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto : undefined;
  return c?.randomUUID ? c.randomUUID() : `ret-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The id a return is sent under. The same return (same bill, lines, condition, way and note) keeps its id across
 * presses and retries, so a lost response cannot return twice; changing anything makes it a different return.
 */
export function requestIdFor(current: { sig: string; id: string } | null, sig: string): { sig: string; id: string } {
  return current && current.sig === sig ? current : { sig, id: newRequestId() };
}

/** Finds a product line on a bill matching a scanned or typed barcode/SKU. */
export function findProductLineByCode(
  products: readonly VisitProductLine[],
  rawCode: string,
): VisitProductLine | null {
  const code = rawCode.trim().toLowerCase();
  if (!code) return null;
  const matches = products.filter(
    (p) =>
      (p.barcode && p.barcode.trim().toLowerCase() === code) ||
      (p.sku && p.sku.trim().toLowerCase() === code),
  );
  if (matches.length === 0) return null;
  return matches.find((p) => lineRemainingQty(p) > 0) ?? matches[0]!;
}

/** Short human-readable bill reference derived from a visit key or product barcode. */
export function formatBillRef(key: string): string {
  const raw = visitKeyFromGroupKey(key).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return raw.slice(0, 8) || 'BILL';
}

/**
 * The one bill whose number was typed or scanned (`#5B0628C5`, `5b0628c5`, or the whole id), or null.
 *
 * QA 2026-10-23: the Return box says "Search by bill number", but Enter only ever matched a product's barcode or SKU, so
 * a typed bill number fell through to the bill already open and was thrown away. Eight characters or more, so a short
 * product code can never be read as a bill.
 */
export function findBillByRef<T extends { key: string }>(bills: readonly T[], rawCode: string): T | null {
  const typed = rawCode.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (typed.length < 8) return null;
  const ref = typed.slice(0, 8);
  const matches = bills.filter((b) => formatBillRef(b.key) === ref);
  return matches.length === 1 ? matches[0]! : null;
}

/** Builds a quantity map selecting all remaining returnable units across every line on a bill. */
export function buildSelectAllQtyMap(products: readonly VisitProductLine[]): Record<string, number> {
  const next: Record<string, number> = {};
  for (const p of products) {
    const rem = lineRemainingQty(p);
    if (rem > 0) next[lineReturnId(p)] = rem;
  }
  return next;
}

export interface ReturnSelectedLine {
  line: VisitProductLine;
  id: string;
  qty: number;
  unitMinor: number;
  refundMinor: number;
}

export interface ReturnSelectionSummary {
  selectedItemsCount: number;
  totalSelectedUnits: number;
  totalRefundMinor: number;
  selectedLines: ReturnSelectedLine[];
}

/**
 * Computes the return selection summary from a bill's products and the user's `qtyByLine` map.
 * Clamps each line to `[0, lineRemainingQty(p)]` and excludes zero-quantity products.
 */
export function computeReturnSelection(
  products: readonly VisitProductLine[],
  qtyByLine: Readonly<Record<string, number>>,
): ReturnSelectionSummary {
  let selectedItemsCount = 0;
  let totalSelectedUnits = 0;
  let totalRefundMinor = 0;
  const selectedLines: ReturnSelectedLine[] = [];

  for (const p of products) {
    const id = lineReturnId(p);
    const rem = lineRemainingQty(p);
    const q = Math.min(rem, Math.max(0, Math.trunc(qtyByLine[id] ?? 0)));
    if (q <= 0) continue;
    const refundMinor = lineRefundMinorForQty(p, q);
    const unitMinor = Math.round(Number(p.paidMinor || 0) / Math.max(1, Number(p.qty || 1)));
    selectedItemsCount += 1;
    totalSelectedUnits += q;
    totalRefundMinor += refundMinor;
    selectedLines.push({ line: p, id, qty: q, unitMinor, refundMinor });
  }

  return {
    selectedItemsCount,
    totalSelectedUnits,
    totalRefundMinor,
    selectedLines,
  };
}

