/**
 * Owner, 2026-10-07 — where paying a waiting token goes: the Record payment page, with the token and its branch in
 * the address so the page can find it in that branch's queue. One helper, so the board and Bookings cannot drift.
 */
export function payTokenHref(token: { id: string; locationId?: string | null }, from?: 'bookings'): string {
  const q = new URLSearchParams({ purpose: 'payment', token: token.id });
  if (token.locationId) q.set('location', token.locationId);
  // Where Close goes: Bookings when it was opened there, else Home (where the token board is). Named, not
  // `history.back()`, which can leave the app from a tab opened on a link.
  if (from) q.set('from', from);
  return `/appointments/new?${q.toString()}`;
}
