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
