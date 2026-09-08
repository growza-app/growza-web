import { describe, expect, it } from 'vitest';
import { isFutureMonth, monthBounds, monthLabel, monthOf, shiftMonth } from './[providerId]/month';

/**
 * Jira GRW-63 · GRW-200 — month arithmetic, tested without rendering anything.
 *
 * A month is a WALL-CLOCK idea: September starts when it starts in Mumbai, not
 * when it starts in UTC, and the register's rows are keyed on local dates
 * (`attendance.on_date`). Getting this wrong shows somebody the 31st of last
 * month or hides the 1st of this one — an off-by-one nobody notices until
 * payroll.
 */
const IST = 'Asia/Kolkata';

describe('which month are we in', () => {
  it('accepts a valid YYYY-MM', () => {
    expect(monthOf('2026-02', IST)).toBe('2026-02');
  });

  it('refuses a malformed or impossible one and falls back to now', () => {
    for (const bad of ['2026-13', '2026-00', '2026-2', 'nope', '2026', '']) {
      expect(monthOf(bad, IST), bad).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    }
  });
});

describe('month boundaries', () => {
  it('a 31-day month', () => {
    expect(monthBounds('2026-01', IST)).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('a 30-day month', () => {
    expect(monthBounds('2026-09', IST)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('February in a common year', () => {
    expect(monthBounds('2026-02', IST)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('February in a LEAP year — the boundary a lookup table gets wrong', () => {
    expect(monthBounds('2028-02', IST)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('and in 2000, which is a leap year despite the century rule', () => {
    expect(monthBounds('2000-02', IST)).toEqual({ from: '2000-02-01', to: '2000-02-29' });
  });

  it('but not 1900, which is not', () => {
    // The rule that catches naive `year % 4` implementations.
    expect(monthBounds('1900-02', IST).to).toBe('1900-02-28');
  });

  it('never spans more than the register will serve', () => {
    // The API refuses a range over 62 days; a month must always fit.
    for (const m of ['2026-01', '2026-02', '2028-02', '2026-04']) {
      const { from, to } = monthBounds(m, IST);
      const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
      expect(days, m).toBeLessThanOrEqual(31);
    }
  });
});

describe('stepping between months', () => {
  it('walks backwards across a year boundary', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('and forwards across one', () => {
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
  });

  it('a round trip returns where it started', () => {
    for (const m of ['2026-01', '2026-12', '2028-02']) {
      expect(shiftMonth(shiftMonth(m, -1), 1), m).toBe(m);
    }
  });
});

describe('the next arrow stops at the present', () => {
  it('the month after this one is in the future', () => {
    const thisMonth = monthOf(undefined, IST);
    expect(isFutureMonth(shiftMonth(thisMonth, 1), IST)).toBe(true);
  });

  it('the current month is not', () => {
    /**
     * `>=` rather than `>`: the current month is a month you may look at, and
     * treating it as future would leave somebody unable to open today.
     */
    expect(isFutureMonth(monthOf(undefined, IST), IST)).toBe(true);
    expect(isFutureMonth(shiftMonth(monthOf(undefined, IST), -1), IST)).toBe(false);
  });
});

describe('the label a person reads', () => {
  it('names the month and the year, never a bare number', () => {
    expect(monthLabel('2026-09')).toBe('September 2026');
    expect(monthLabel('2026-01')).toBe('January 2026');
  });
});
