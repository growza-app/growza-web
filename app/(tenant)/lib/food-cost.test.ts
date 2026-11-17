import { describe, expect, it } from 'vitest';
import { foodCostTone, pctText } from './food-cost';
import { clampReportRange } from './report-dates';

/** Jira GRW-739 — the food-cost colours (owner, 2026-11-18) and the report's 92-day window. */
describe('food-cost colours: amber above 35%, red above 45%', () => {
  it.each([
    [23.6, 'ok'],
    [35, 'ok'],
    [35.1, 'warn'],
    [45, 'warn'],
    [45.1, 'bad'],
    [null, 'none'],
  ] as const)('%s%% is %s', (pct, tone) => expect(foodCostTone(pct)).toBe(tone));

  it('a ₹0 dish or a dish with no recipe shows "—", never 0%', () => {
    expect(pctText(null)).toBe('—');
    expect(pctText(23.6)).toBe('23.6%');
    expect(pctText(12)).toBe('12%');
  });
});

describe('Validations — Food cost reads up to 92 days', () => {
  it('a longer pick is pulled in to 92 days; the other money reports keep 366', () => {
    expect(clampReportRange('2026-01-01', '2026-11-18', '2026-11-18', 'from', 92)).toEqual({ fromISO: '2026-01-01', toISO: '2026-04-02' });
    expect(clampReportRange('2026-01-01', '2026-11-18', '2026-11-18', 'to', 92)).toEqual({ fromISO: '2026-08-19', toISO: '2026-11-18' });
    expect(clampReportRange('2026-01-01', '2026-11-18', '2026-11-18', 'to')).toEqual({ fromISO: '2026-01-01', toISO: '2026-11-18' });
  });
});
