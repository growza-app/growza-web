/**
 * Jira GRW-695 — audit rows grouped under the day they happened: Today, Yesterday, then the date.
 *
 * Days are IST calendar days, the zone every other admin date is shown in; a row at 00:30 IST on the 10th belongs
 * to the 10th, not to the 9th it still is in UTC. Rows keep the order they arrived in (newest first from the API).
 */
const ZONE = 'Asia/Kolkata';

const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export interface DayGroup<T> {
  key: string;
  label: string;
  rows: T[];
}

export function groupByDay<T extends { createdAt: string }>(rows: readonly T[], now: Date = new Date()): DayGroup<T>[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  const groups: DayGroup<T>[] = [];
  for (const row of rows) {
    const at = new Date(row.createdAt);
    const key = dayKey(at);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      const label =
        key === today
          ? 'Today'
          : key === yesterday
            ? 'Yesterday'
            : new Intl.DateTimeFormat('en-IN', { timeZone: ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(at);
      group = { key, label, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

/** The time of day alone, for a row already under its day heading: `2:14 pm`. */
export function timeOfDay(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}
