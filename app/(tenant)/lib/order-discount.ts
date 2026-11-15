/**
 * QA 2026-11-15 — the discount the counter gave on an order, for the order screen.
 *
 * The bill's lines carry what was charged, so a discount shows on an order only as smaller line amounts: the screen
 * said "Tikka ₹150 · Total ₹200" and nothing about the ₹40 that came off a ₹240 bill. This is that ₹40: the lines at
 * their own prices, less what they were charged, less any reward points (which the screen already names on their
 * own line). The order as it was sold — a later return does not change what was given off it.
 *
 * Lines that replaced another in a size swap are left out: they are the same sale's units again, not a second sale.
 * Null when the viewer is not shown money (no prices on the lines), or nothing came off.
 */
export function orderDiscountMinor(
  lines: ReadonlyArray<{ qty: number; priceMinor?: string; paidMinor?: string; swappedFromId: string | null }>,
  rewardDiscountMinor = 0,
): number | null {
  const sold = lines.filter((l) => l.swappedFromId === null);
  if (sold.length === 0 || sold.some((l) => l.priceMinor === undefined || l.paidMinor === undefined)) return null;
  const list = sold.reduce((n, l) => n + Number(l.priceMinor) * l.qty, 0);
  const paid = sold.reduce((n, l) => n + Number(l.paidMinor), 0);
  const off = list - paid - rewardDiscountMinor;
  return off > 0 ? off : null;
}
