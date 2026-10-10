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

/**
 * Owner, 2026-10-10 — where settling a BOOKING goes: the same Record payment page, with the visit in the
 * address instead of a token.
 *
 * `on` is the visit's own day, and it is here because there is no read for one appointment by id — the day's
 * list is, and the visit's other legs come back with it. Without it a booking for next Tuesday could not be
 * found at all. The day is the SALON's, not the browser's: a 11:40pm visit is still today in Bengaluru when
 * the laptop has rolled over.
 *
 * One helper for all three doors into it — the walk-in's done screen, Mark as done, and the token board's
 * with-a-stylist column — so they cannot drift the way the tills they replaced had.
 */
export function payVisitHref(
  visit: { appointmentId: string; startAt: string },
  timezone: string,
  from?: 'bookings',
): string {
  const q = new URLSearchParams({
    purpose: 'payment',
    visit: visit.appointmentId,
    on: new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(visit.startAt)),
  });
  if (from) q.set('from', from);
  return `/appointments/new?${q.toString()}`;
}

/**
 * One booking, open, by address.
 *
 * `?open=` opens a booking by id — Search already uses it, and it looks through the whole day BEFORE any
 * filter, so the status segment cannot hide the row. `date`/`to` ride along because the list shows today: a
 * visit settled just after midnight, or tomorrow's booking read from Home, is not in today's list and the
 * sheet would never find it.
 *
 * Two screens want this. "Fix a mistake" on the done screen (owner, 2026-10-10) — it was a bare link to
 * `/appointments`, which on a busy day is twenty-five rows and a hunt for the one the desk has this second
 * got wrong. And Home's "Bookings today" rows (owner, 2026-10-11), which named a client, a service, a
 * stylist and a status, looked exactly like rows that open everywhere else in the app, and did nothing.
 */
export function openBookingHref(appointmentId: string, day?: string | null): string {
  const q = new URLSearchParams({ open: appointmentId });
  if (day) {
    q.set('date', day);
    q.set('to', day);
  }
  return `/appointments?${q.toString()}`;
}
