import { describe, expect, it } from 'vitest';
import { bucketDays, chartUnitFor, namedTicks, type DayPoint } from './report-buckets';

/** Days from `startISO`, each worth `each` minor units, so a total is easy to reason about. */
function days(startISO: string, count: number, each = 100): DayPoint[] {
  const out: DayPoint[] = [];
  const base = Date.parse(`${startISO}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    const d = new Date(base + i * 86_400_000);
    const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    out.push({ dateISO: d.toISOString().slice(0, 10), dow, valueMinor: String(each) });
  }
  return out;
}

describe('how long a period has to be before its days are grouped', () => {
  it('follows the thresholds the server already uses', () => {
    expect(chartUnitFor(1)).toBe('day');
    expect(chartUnitFor(31)).toBe('day');
    expect(chartUnitFor(32)).toBe('week');
    expect(chartUnitFor(182)).toBe('week');
    expect(chartUnitFor(183)).toBe('month');
    expect(chartUnitFor(366)).toBe('month');
  });
});

describe('grouping the days', () => {
  it('leaves a short period alone — one column per day, as it always was', () => {
    const { unit, buckets } = bucketDays(days('2026-10-27', 7));
    expect(unit).toBe('day');
    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toEqual({ startISO: '2026-10-27', dow: 2, valueMinor: 100 });
  });

  it('turns a 33-day period into weeks, not 33 slivers', () => {
    // 1 Oct 2026 is a Thursday, so the first bucket is a part-week and the rest are Monday to Sunday.
    const { unit, buckets } = bucketDays(days('2026-10-01', 33));
    expect(unit).toBe('week');
    expect(buckets.length).toBeLessThanOrEqual(6);
    expect(buckets[0]!.startISO).toBe('2026-10-01');
    // Every rupee is still on the chart, wherever it was grouped.
    expect(buckets.reduce((n, b) => n + b.valueMinor, 0)).toBe(33 * 100);
  });

  it('turns a year into months', () => {
    const { unit, buckets } = bucketDays(days('2026-01-01', 365));
    expect(unit).toBe('month');
    expect(buckets).toHaveLength(12);
    expect(buckets[0]!.startISO).toBe('2026-01-01');
    expect(buckets[1]!.startISO).toBe('2026-02-01');
    expect(buckets.reduce((n, b) => n + b.valueMinor, 0)).toBe(365 * 100);
  });

  it('keeps a quiet stretch in its place instead of dropping it', () => {
    // 1 Oct 2026 is a Thursday, so indices 4–10 are the whole week of Mon 5 Oct — the one that must stay,
    // at nought, rather than vanish and let the weeks either side sit next to each other.
    const rows = days('2026-10-01', 40).map((d, i) => (i >= 4 && i < 11 ? { ...d, valueMinor: '0' } : d));
    const { buckets } = bucketDays(rows);
    expect(buckets.some((b) => b.valueMinor === 0)).toBe(true);
    // In order, and no bucket invented or lost.
    const sorted = [...buckets].sort((a, b) => a.startISO.localeCompare(b.startISO));
    expect(buckets.map((b) => b.startISO)).toEqual(sorted.map((b) => b.startISO));
  });

  it('labels the first bucket by the day the period really starts on', () => {
    // Starting mid-week, the first column must not claim to begin on the Monday before the period.
    const { buckets } = bucketDays(days('2026-10-07', 40));
    expect(buckets[0]!.startISO).toBe('2026-10-07');
  });

  it('survives a period of one day and of none', () => {
    expect(bucketDays(days('2026-11-02', 1)).buckets).toHaveLength(1);
    expect(bucketDays([])).toEqual({ unit: 'day', buckets: [] });
  });
});

describe('which columns are named', () => {
  it('names them all while they all fit', () => {
    const named = namedTicks(7);
    expect([0, 1, 2, 3, 4, 5, 6].every(named)).toBe(true);
  });

  it('thins them once they would print over each other, keeping both ends', () => {
    const total = 31;
    const named = namedTicks(total);
    const count = Array.from({ length: total }, (_, i) => i).filter(named).length;
    expect(named(0)).toBe(true);
    expect(named(total - 1)).toBe(true);
    expect(count).toBeLessThanOrEqual(8);
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it('never names a column right next to the last one', () => {
    for (const total of [12, 19, 23, 31, 45, 92, 366]) {
      const named = namedTicks(total);
      const idx = Array.from({ length: total }, (_, i) => i).filter(named);
      const gapAtEnd = idx[idx.length - 1]! - idx[idx.length - 2]!;
      expect(gapAtEnd, `total ${total}`).toBeGreaterThanOrEqual(Math.ceil(Math.ceil(total / 7) / 2));
    }
  });
});
