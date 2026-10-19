/**
 * Jira GRW-582 — how much of a price is GST, for the line under the price field.
 *
 * Prices include GST, always: the price an owner types is what the client pays, and the GST is carved out of it
 * (118 at 18% holds 18: 118 × 18 ÷ 118). The till charges the typed price and never adds tax on top, so there is no
 * "plus GST" mode to describe — an earlier version of this file had one, and the field under the price promised
 * "the client pays ₹118" for a ₹100 price that the till then charged as ₹100.
 *
 * This is the same arithmetic the invoice does (`tax-engine.ts`) for ONE line. An invoice rounds once, at the bill's
 * total, so on a bill of several lines the invoice can differ from a sum of these by a paisa — which is why the field
 * says what this one item carries, not what a bill will come to.
 *
 * `null` when there is nothing to say: no rate, a 0% rate (the invoice says so itself), or no price yet.
 */
export function gstInPrice(priceMinor: number, rateBp: number | null): { taxMinor: number } | null {
  if (rateBp === null || !Number.isFinite(rateBp) || rateBp <= 0) return null;
  if (!Number.isFinite(priceMinor) || priceMinor <= 0) return null;
  // Half away from zero, as the invoice does; for a positive amount that is Math.round.
  return { taxMinor: Math.round((priceMinor * rateBp) / (10_000 + rateBp)) };
}
