import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/** Reports UX check 2026-11-28 — one period menu (#2), a cut figure (#1), the bill link (#6), empty blocks (#10), one-channel shops (#4). */
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');
const period = read('ReportPeriod.tsx');

describe('one period control on every report', () => {
  it('a menu of the usual periods, then "Custom dates", which opens the two date fields', () => {
    expect(period).toContain('<option value="custom">');
    expect(period).toContain("value === 'custom' ? <ReportDates");
    expect(period).toContain('REPORT_PRESETS.map');
    expect(read('CounterReport.tsx')).toContain('<ReportPeriod');
    expect(read('money/MoneyShell.tsx')).toContain('<ReportPeriod');
    expect(read('money/MoneyShell.tsx')).not.toContain('mr-presets');
  });

  it('a period that is no preset (a saved link) opens as custom, so its dates are on screen', () => {
    expect(period).toContain('useState(matched === undefined)');
  });

  it('speaks English and Hindi', () => {
    for (const m of [en, hi]) {
      expect(m.reportPeriod.custom).toBeTruthy();
      expect(Object.keys(m.reportPeriod.presets).sort()).toEqual(['last7', 'lastWeek', 'thisMonth', 'thisWeek']);
    }
  });
});

describe('the rest of the check', () => {
  const css = readFileSync(join(__dirname, '../styles/99-stock-report.css'), 'utf8');
  it('a tile figure is sized to its tile, never cut (#1)', () => {
    expect(css).toMatch(/\.srp-kpi-card \{\n  container-type: inline-size;/);
    expect(css).toContain('font-size: clamp(1.125rem, 17cqi, 1.75rem);');
  });
  it('"Free bills 0" is not drawn (#10)', () => {
    expect(read('money/DiscountReport.tsx')).toContain('{r.totals.freeBills > 0 ? (');
  });
  it('the Payments note names no restaurant apps (#8)', () => {
    expect(en.moneyReports.payments.counterOnly).not.toMatch(/Swiggy|Zomato/);
    expect(hi.moneyReports.payments.counterOnly).not.toMatch(/Swiggy|Zomato/);
  });
});
