/**
 * Owner, 2026-11-15 — a discount on the whole bill, as a percentage or an amount, for every business's till.
 *
 * The till could already take a typed total ("Change the total"), and that is still how a discount reaches the API:
 * the bill's lines carry what was charged. What this adds is the way a counter actually thinks — "give her 10%" —
 * and the words for it on the bill and the WhatsApp receipt ("Discount (10%): −₹38").
 *
 * Whole rupees only, like the typed total: a counter does not hand back paise.
 */

export type DiscountKind = 'pct' | 'amount';

export const QUICK_PERCENTS = [5, 10, 15, 20] as const;

/** What `pct` percent takes off a bill of `listMinor`, rounded to the whole rupee, never more than the bill. */
export function percentOffMinor(listMinor: number, pct: number): number {
  if (!(pct > 0) || listMinor <= 0) return 0;
  return Math.min(listMinor, Math.round((listMinor * pct) / 100 / 100) * 100);
}

/**
 * The discount a typed value gives, or why it cannot: a percentage from above nought to 100, an amount from above
 * nought to the whole bill. Rupees as typed; paise are refused rather than rounded behind the counter's back.
 */
export function discountFrom(kind: DiscountKind, typed: string, listMinor: number): { offMinor: number } | { problem: 'empty' | 'tooBig' | 'notWhole' } {
  const v = Number(typed.trim());
  if (typed.trim() === '' || !Number.isFinite(v) || v <= 0) return { problem: 'empty' };
  if (kind === 'pct') {
    if (v > 100) return { problem: 'tooBig' };
    return { offMinor: percentOffMinor(listMinor, v) };
  }
  if (!Number.isInteger(v)) return { problem: 'notWhole' };
  if (v * 100 > listMinor) return { problem: 'tooBig' };
  return { offMinor: v * 100 };
}

/**
 * The percentage to NAME on the bill, or null. Only while the total is still exactly what that percentage gave: the
 * moment anything changes it — a line added, the total typed over — the bill says "Discount" and the amount, which is
 * then the truth, rather than a percentage that no longer is.
 */
export function shownPercent(pct: number | null, listMinor: number, totalMinor: number): number | null {
  if (pct === null) return null;
  const off = percentOffMinor(listMinor, pct);
  return off > 0 && listMinor - off === totalMinor ? pct : null;
}

/**
 * Jira GRW-725 — owner decision 2026-11-17: a discount that takes the bill to ₹0 is the owner's, with a typed reason.
 * The counter and the manager can still give a smaller one. The server refuses the rest (403 / 400); this is only
 * so the till says so before anyone taps Pay.
 */
export const FREE_REASON_MIN = 3;
export const FREE_REASON_MAX = 200;

/** A bill worth something at its prices, charged nothing. An item whose own price is ₹0 is not a discount. */
export function isFreeBill(listMinor: number, totalMinor: number): boolean {
  return listMinor > 0 && totalMinor <= 0;
}

/** A reason the server will take: 3 to 200 letters once trimmed. */
export function freeReasonOk(reason: string): boolean {
  const n = reason.trim().length;
  return n >= FREE_REASON_MIN && n <= FREE_REASON_MAX;
}

/**
 * What stops Pay on a free bill, or null when nothing does: not the owner, or the owner has not said why yet.
 */
export function freeBillBlock(listMinor: number, totalMinor: number, isOwner: boolean, reason: string): 'ownerOnly' | 'needsReason' | null {
  if (!isFreeBill(listMinor, totalMinor)) return null;
  if (!isOwner) return 'ownerOnly';
  return freeReasonOk(reason) ? null : 'needsReason';
}
