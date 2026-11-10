/**
 * Owner, 10 Nov 2026 — the phone's Orders list is grouped under a heading per day, in the branch's own time zone.
 *
 * Rows arrive newest first, a page at a time, so the groups keep that order and never re-sort. A day cut across two
 * pages simply starts the next page with the same heading. That is also why a heading carries no day total: a page
 * holds part of a day, and a sum of part of a day would read as the day's takings.
 */
export type DayKind = 'today' | 'yesterday' | 'other';

const dayKey = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(new Date(ms));

export function groupByDay<T extends { soldAt: string }>(rows: readonly T[], timeZone: string, now: number): { key: string; kind: DayKind; rows: T[] }[] {
  const today = dayKey(now, timeZone);
  const yesterday = dayKey(now - 86_400_000, timeZone);
  const days: { key: string; kind: DayKind; rows: T[] }[] = [];
  for (const row of rows) {
    const key = dayKey(Date.parse(row.soldAt), timeZone);
    const last = days[days.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else days.push({ key, kind: key === today ? 'today' : key === yesterday ? 'yesterday' : 'other', rows: [row] });
  }
  return days;
}
