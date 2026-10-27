import { describe, expect, it } from 'vitest';
import { chartHeightFor, FLAT_HEIGHT, TREND_HEIGHT } from './OverviewTab';

/**
 * Owner, 2026-10-27 — a chart only gets trend-sized space when there is a trend.
 *
 * The screen that prompted this: Glow Salon, This month, 27 buckets with 4 of them carrying anything —
 * a flat zero floor with one spike on the right, drawn 210px tall as if it were a month of trading.
 */
const days = (n: number, nonZero: number) => Array.from({ length: n }, (_, i) => (i < nonZero ? 1000 : 0));

describe('how tall a trend chart is', () => {
  it('is full height for a period that is mostly trading', () => {
    expect(chartHeightFor([days(27, 20)], 27)).toBe(TREND_HEIGHT);
    // Exactly a fifth is enough: the rule is "below a fifth", not "under it or at it".
    expect(chartHeightFor([days(30, 6)], 30)).toBe(TREND_HEIGHT);
  });

  it('is flat for the screen that prompted it — 4 days of 27', () => {
    expect(chartHeightFor([days(27, 4)], 27)).toBe(FLAT_HEIGHT);
  });

  it('is flat for one or two points however short the range', () => {
    // Two of seven is 29% of the period and still two dots.
    expect(chartHeightFor([days(7, 2)], 7)).toBe(FLAT_HEIGHT);
    expect(chartHeightFor([days(1, 1)], 1)).toBe(FLAT_HEIGHT);
    expect(chartHeightFor([days(7, 0)], 7)).toBe(FLAT_HEIGHT);
  });

  it('lets the busiest series decide, so the two cards beside each other are one height', () => {
    // Money every day, bookings on two: both get the money chart's height.
    expect(chartHeightFor([days(20, 18), days(20, 2)], 20)).toBe(TREND_HEIGHT);
  });

  it('survives a period with no buckets at all rather than reading NaN', () => {
    expect(chartHeightFor([], 0)).toBe(FLAT_HEIGHT);
  });
});
