/**
 * Jira GRW-582 — how much of a price is GST, for the line under the price field.
 *
 * Two ways a business prices things, and the setting that says which (`Settings › GST › Prices include GST`):
 *
 * | | price you type | client pays | GST |
 * |---|---|---|---|
 * | includes GST (the default) | 118 | 118 | 18, carved out: 118 × 18 ÷ 118 |
 * | excludes GST | 100 | 118 | 18, added on top: 100 × 18 ÷ 100 |
 *
 * This is the same arithmetic the invoice does (`tax-engine.ts`) for ONE line. An invoice rounds once, at the bill's
 * total, so on a bill of several lines the invoice can differ from a sum of these by a paisa — which is why the field
 * says what this one item carries, not what a bill will come to.
 *
 * `null` when there is nothing to say: no rate, a 0% rate (the invoice says so itself), or no price yet.
 */
export interface GstInPrice {
  /** The GST on this item, in paise. */
  taxMinor: number;
  /** What the client pays for it, in paise. */
  totalMinor: number;
}

export function gstInPrice(priceMinor: number, rateBp: number | null, includesTax: boolean): GstInPrice | null {
  if (rateBp === null || !Number.isFinite(rateBp) || rateBp <= 0) return null;
  if (!Number.isFinite(priceMinor) || priceMinor <= 0) return null;
  const exact = includesTax ? (priceMinor * rateBp) / (10_000 + rateBp) : (priceMinor * rateBp) / 10_000;
  // Half away from zero, as the invoice does; for a positive amount that is Math.round.
  const taxMinor = Math.round(exact);
  return { taxMinor, totalMinor: includesTax ? priceMinor : priceMinor + taxMinor };
}
