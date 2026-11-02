import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const diary = read('reports/DiaryReport.tsx');
const counter = read('reports/CounterReport.tsx');

/** Owner, 2026-11-02 — the period is asked for as two dates, not picked from a list of five. */
describe('Both reports are asked for by date', () => {
  it.each([
    ['diary', diary, 'diaryReport'],
    ['counter', counter, 'counterReport'],
  ])('%s sends a custom range built from the two fields', (_name, src, call) => {
    expect(src).toContain(`api.${call}({ range: 'custom', from: dates.fromISO, to: dates.toISO`);
    expect(src).toContain('<ReportDates');
    // The list of five periods, and the select that held them, are gone.
    expect(src).not.toContain('cr-select');
    expect(src).not.toContain('const RANGES');
  });

  it.each([
    ['diary', diary],
    ['counter', counter],
  ])('%s opens on the week it always opened on, in the business’s own zone', (_name, src) => {
    expect(src).toContain('useState(() => defaultReportRange(todayISO))');
    expect(src).toContain('todayInZone(session?.timezone)');
  });

  it.each([
    ['diary', diary],
    ['counter', counter],
  ])('%s applies a pair only once both dates are whole', (_name, src) => {
    expect(src).toContain('if (!iso.test(fromISO) || !iso.test(toISO)) return;');
    expect(src).toContain('clampReportRange(fromISO, toISO, todayISO, changed)');
  });

  it('the fields are the Sales filter’s, not a second set of them', () => {
    const control = read('reports/ReportDates.tsx');
    expect(control).toContain('className="sls-dates cr-dates"');
    expect(control).toContain('className="sls-date-input"');
    // Neither end may be a day that has not happened.
    expect(control.match(/max=\{today\}/g)).toHaveLength(2);
  });

  it.each([
    ['diary', diary],
    ['counter', counter],
  ])('%s groups a long period and thins the axis rather than drawing a smear', (_name, src) => {
    // 33 days was 33 columns 6px wide with a weekday printed over the next one.
    expect(src).toContain('bucketDays(takings.byDay)');
    expect(src).toContain('namedTicks(bars.length)');
    expect(src).toContain("{barNamed(i) ? barLabel.tick(b) : ''}");
    // Thinning the axis must not take the figures off the screen for somebody listening to it.
    expect(src).toContain('{barLabel.full(b)} {money(b.valueMinor)}');
    // The peak is the tallest BUCKET now, not the tallest day, or every grouped bar would overflow its slot.
    expect(src).toContain('Math.max(...bars.map((b) => b.valueMinor), 1)');
  });

  it('the words exist in both languages', () => {
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(read(`../../messages/${lang}.json`));
      for (const group of ['diaryReport', 'counterReport']) {
        expect(m[group].from, `${lang}.${group}.from`).toBeTruthy();
        expect(m[group].to, `${lang}.${group}.to`).toBeTruthy();
      }
    }
  });
});
