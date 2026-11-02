import { DateTime } from 'luxon';

/**
 * Owner, 2026-11-02 — a takings chart that stays readable however long the period is.
 *
 * The API sends one figure per day for any span, and deliberately sends no day NAMES with them: an English
 * word in a payload is a screen Hindi cannot render (`reports-i18n.test.ts`). Drawing one column per day was
 * fine while the longest period anyone picked was a week; over a month it is 33 columns 6px wide with a
 * weekday printed under each, and `.cr-bar-tick` is allowed to overflow its column, so the axis became one
 * smear of overlapping text. A year would be 366 columns under 1px.
 *
 * Grouping the days and thinning the labels both belong here and not on the server, for the same reason the
 * day names do: how many columns fit and how they read is the screen's own question, and it is asked again
 * in every language.
 */

export type DayPoint = { dateISO: string; dow: number; valueMinor: string };
export type ChartUnit = 'day' | 'week' | 'month';

export interface ChartBucket {
  /** The bucket's first day. Its React key, and what the label is formatted from. */
  startISO: string;
  /** 1 = Monday … 7 = Sunday. Only meaningful when the unit is `day`. */
  dow: number;
  valueMinor: number;
}

/**
 * The server's own thresholds (`bucketUnitFor` in `analytics/range.ts`), so a span is grouped the way the
 * rest of the system already says it should be rather than by a second opinion invented here.
 */
export function chartUnitFor(dayCount: number): ChartUnit {
  if (dayCount <= 31) return 'day';
  if (dayCount <= 182) return 'week';
  return 'month';
}

/** Monday of the week `iso` falls in — the week this product counts everywhere else. */
function weekStart(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' }).startOf('week');
}

/**
 * The days, grouped so that each column is wide enough to read.
 *
 * Buckets are built by walking the days in order, so a gap in the data cannot produce a bucket out of
 * sequence, and an empty bucket in the middle of a period keeps its place — a quiet week must look quiet,
 * not be missing.
 */
export function bucketDays(days: readonly DayPoint[]): { unit: ChartUnit; buckets: ChartBucket[] } {
  const unit = chartUnitFor(days.length);
  if (unit === 'day') {
    return {
      unit,
      buckets: days.map((d) => ({ startISO: d.dateISO, dow: d.dow, valueMinor: Number(d.valueMinor) })),
    };
  }

  const keyOf = (iso: string) =>
    unit === 'week'
      ? weekStart(iso).toISODate()!
      : DateTime.fromISO(iso, { zone: 'utc' }).startOf('month').toISODate()!;

  const buckets: ChartBucket[] = [];
  const at = new Map<string, ChartBucket>();
  for (const d of days) {
    const key = keyOf(d.dateISO);
    let bucket = at.get(key);
    if (!bucket) {
      // The period rarely starts on a Monday or a 1st, so the first bucket is labelled by the day the period
      // actually starts on. A column saying "27 Oct" that begins on the 29th would be a lie about the figures.
      bucket = { startISO: buckets.length === 0 ? d.dateISO : key, dow: d.dow, valueMinor: 0 };
      at.set(key, bucket);
      buckets.push(bucket);
    }
    bucket.valueMinor += Number(d.valueMinor);
  }
  return { unit, buckets };
}

/**
 * Which columns carry a written label, so that they never print over one another.
 *
 * The counter report's hour axis already does this ("only every third hour is named, with the ends always
 * named so the axis has a range"); this is that rule with the step worked out from how many columns there
 * are. The column is still drawn for every bucket — it is the label that thins out, and every bucket keeps
 * its full text for a screen reader.
 */
export function namedTicks(total: number, max = 7): (index: number) => boolean {
  if (total <= max) return () => true;
  const step = Math.ceil(total / max);
  return (i) => {
    if (i === 0 || i === total - 1) return true;
    // A label landing just before the last one would collide with it, so the end wins and this one drops.
    return i % step === 0 && total - 1 - i >= Math.ceil(step / 2);
  };
}
