/**
 * Jira GRW-63 · GRW-200 — month arithmetic for the attendance view.
 *
 * Its own file so the page, the screen and the tests all agree about what "this
 * month" means, and so it can be tested without rendering anything.
 *
 * Every boundary is computed in the SALON's timezone. A month is a wall-clock
 * idea: "September" starts when it starts in Mumbai, not when it starts in UTC,
 * and the register's rows are keyed on local dates (`attendance.on_date`).
 */

/** "YYYY-MM" for a month, defaulting to the current one in the salon's zone. */
export function monthOf(raw: string | undefined, timezone: string): string {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7);
}

/** First and last local dates of the month, as "YYYY-MM-DD". */
export function monthBounds(month: string, _timezone: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const year = y!;
  const mon = m!;
  // Day 0 of the NEXT month is the last day of this one, which is how February
  // and every leap year get handled without a table.
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { from: `${month}-01`, to: `${month}-${pad(lastDay)}` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The Intl locale for a dashboard language: English keeps `en-GB` ("September 2026"), other languages use their India variant. */
export function intlLocale(locale: string): string {
  return locale === 'en' ? 'en-GB' : `${locale}-IN`;
}

export function monthLabel(month: string, locale = 'en'): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString(intlLocale(locale), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Whether `month` is at or after the salon's current month — used to stop the "next" arrow walking into the future. */
export function isFutureMonth(month: string, timezone: string): boolean {
  return month >= monthOf(undefined, timezone);
}
