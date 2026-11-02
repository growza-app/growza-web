import { DateTime } from 'luxon';

/**
 * Owner, 2026-11-02 — the report is asked for by two dates, not by a list of five periods.
 *
 * The rules here are the server's, said again on this side so the owner is told before the request rather
 * than by a 400: `resolveRange('custom')` in `src/modules/analytics/range.ts` refuses a pair that is the
 * wrong way round and a span over `MAX_CUSTOM_RANGE_DAYS`. Nothing here decides anything the server does
 * not — it only stops the screen asking for what it knows will be refused.
 */

/** The server's `MAX_CUSTOM_RANGE_DAYS`. A longer span is a 400, so the fields never offer one. */
export const MAX_REPORT_SPAN_DAYS = 366;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Which field the owner just touched. The OTHER one is the one that gives way. */
export type ChangedEnd = 'from' | 'to';

/** Today where the business is, not where the reader is: an owner abroad still reads their own day. */
export function todayInZone(timezone?: string | null): string {
  const zoned = timezone ? DateTime.now().setZone(timezone) : null;
  return (zoned?.isValid ? zoned : DateTime.now()).toISODate()!;
}

/** `iso` moved by whole days. Fixed to UTC, because these are calendar dates and never instants. */
export function shiftDays(iso: string, days: number): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).plus({ days }).toISODate()!;
}

/** Days from `from` to `to`, counting both ends — the way the server counts a custom span. */
export function spanDays(fromISO: string, toISO: string): number {
  const from = DateTime.fromISO(fromISO, { zone: 'utc' });
  const to = DateTime.fromISO(toISO, { zone: 'utc' });
  if (!from.isValid || !to.isValid) return 0;
  return Math.round(to.diff(from, 'days').days) + 1;
}

/**
 * The seven days this report has always opened on: today and the six before it.
 *
 * Exactly the server's `last_7_days`, so replacing the period list with two dates does not change the
 * figures an owner sees when they walk in.
 */
export function defaultReportRange(todayISO: string): { fromISO: string; toISO: string } {
  return { fromISO: shiftDays(todayISO, -6), toISO: todayISO };
}

/**
 * The nearest pair to what was typed that the server will actually answer.
 *
 * - Neither end may be in the future: nothing has been taken there yet.
 * - An end that crosses the other drags it along rather than refusing the tap. This is the Sales filter's
 *   rule (`clampSalesDateRange`) and the owner has met it there.
 * - A span over the server's limit pulls in the end that was NOT touched; if that is not enough — a `from`
 *   so old that even today is too far from it — the touched end gives way too, because a pair that cannot
 *   be answered is worse than one that is not quite what was asked for.
 */
export function clampReportRange(
  fromISO: string,
  toISO: string,
  todayISO: string,
  changed: ChangedEnd = 'from',
): { fromISO: string; toISO: string } {
  const today = ISO.test(todayISO) ? todayISO : DateTime.now().toISODate()!;
  const fallback = defaultReportRange(today);
  let from = ISO.test(fromISO) ? fromISO : fallback.fromISO;
  let to = ISO.test(toISO) ? toISO : fallback.toISO;

  if (from > today) from = today;
  if (to > today) to = today;

  if (from > to) {
    if (changed === 'from') to = from;
    else from = to;
  }

  if (spanDays(from, to) > MAX_REPORT_SPAN_DAYS) {
    if (changed === 'from') {
      to = shiftDays(from, MAX_REPORT_SPAN_DAYS - 1);
      if (to > today) to = today;
    } else {
      from = shiftDays(to, -(MAX_REPORT_SPAN_DAYS - 1));
    }
    // Clamping `to` back to today can leave the span long again, when `from` is further back than the limit
    // allows from today at all. Then the end the owner touched is the one that has to move.
    if (spanDays(from, to) > MAX_REPORT_SPAN_DAYS) from = shiftDays(to, -(MAX_REPORT_SPAN_DAYS - 1));
  }

  return { fromISO: from, toISO: to };
}
