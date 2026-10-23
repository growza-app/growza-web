import { DateTime } from 'luxon';
import type { ReportRangeKey } from './report-types';

/**
 * Jira GRW-643 — the four windows the PHONE Home's own period filter offers, which are not the laptop
 * command center's three. A phone owner opens Home to ask "how is today going"; the laptop's three
 * ranges answer a different, longer question, and they stay exactly as they were.
 */
export type PhonePeriod = 'today' | 'yesterday' | 'this_week' | 'this_month';

/**
 * The window a phone period means, in the shape the report routes take it, in the business's own zone.
 *
 * Only `today` and `this_month` are range keys of their own. Yesterday and the week go as `custom`,
 * whose comparison the API makes the equal-length window immediately before — yesterday against the day
 * before it, a part-week against the same number of days before it. Both `from` and `to` are INCLUSIVE
 * dates, which is what `resolveRange`'s custom arm reads (`src/modules/analytics/range.ts`).
 *
 * "This week" is the calendar week to date, Monday first. `src/modules/analytics/home.ts`'s `homeWindow`
 * already fixes that as what the word means in this product — `last_7_days` is a rolling window, which is
 * not what "This week" says when it sits beside "Today".
 *
 * A timezone that is missing or that luxon refuses falls back to the browser's own zone rather than
 * throwing: a wrong-by-hours window is recoverable, a Home that does not render is not.
 */
export function phoneWindow(
  period: PhonePeriod,
  timezone: string | undefined,
  now: Date,
): { range: ReportRangeKey; from?: string; to?: string } {
  const zoned = timezone ? DateTime.fromJSDate(now, { zone: timezone }) : DateTime.fromJSDate(now);
  const day = (zoned.isValid ? zoned : DateTime.fromJSDate(now)).startOf('day');
  const iso = (d: DateTime) => d.toISODate() ?? '';
  if (period === 'today') return { range: 'today' };
  if (period === 'this_month') return { range: 'this_month' };
  if (period === 'yesterday') {
    const y = day.minus({ days: 1 });
    return { range: 'custom', from: iso(y), to: iso(y) };
  }
  return { range: 'custom', from: iso(day.startOf('week')), to: iso(day) };
}
