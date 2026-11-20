import { describe, expect, it } from 'vitest';
import { presetRange, REPORT_PRESETS } from './report-dates';

// 2026-11-21 is a Saturday.
const SAT = '2026-11-21';

describe('report quick periods (owner, 2026-11-21)', () => {
  it('last 7 days is today and the six before, the report opening as it always has', () => {
    expect(presetRange('last7', SAT)).toEqual({ fromISO: '2026-11-15', toISO: SAT });
  });

  it('a week runs Monday to Sunday and never past today', () => {
    expect(presetRange('thisWeek', SAT)).toEqual({ fromISO: '2026-11-16', toISO: SAT });
    expect(presetRange('lastWeek', SAT)).toEqual({ fromISO: '2026-11-09', toISO: '2026-11-15' });
    expect(presetRange('thisWeek', '2026-11-16')).toEqual({ fromISO: '2026-11-16', toISO: '2026-11-16' });
    expect(presetRange('lastWeek', '2026-11-22')).toEqual({ fromISO: '2026-11-09', toISO: '2026-11-15' });
  });

  it('this month starts on the 1st, across a year end too', () => {
    expect(presetRange('thisMonth', SAT)).toEqual({ fromISO: '2026-11-01', toISO: SAT });
    expect(presetRange('lastWeek', '2027-01-02')).toEqual({ fromISO: '2026-12-21', toISO: '2026-12-27' });
  });

  it('every preset has its words in both languages', async () => {
    const en = (await import('../../../messages/en.json')).default as { moneyReports: { presets: Record<string, string> } };
    const hi = (await import('../../../messages/hi.json')).default as { moneyReports: { presets: Record<string, string> } };
    for (const k of REPORT_PRESETS) {
      expect(en.moneyReports.presets[k]).toBeTruthy();
      expect(hi.moneyReports.presets[k]).toBeTruthy();
    }
  });
});
