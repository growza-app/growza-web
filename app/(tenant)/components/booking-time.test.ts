import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-527 — the Booking time, beside the date. Optional: empty is a walk-in now. A time makes it a booking
 * (the way to book LATER TODAY, which the date alone cannot — today is the walk-in), the phone is then required,
 * it cannot be before now today, and the time step opens with it selected if it is free, else the next free one.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));

describe('the Booking time', () => {
  it('is an optional time field after the date, empty by default', () => {
    expect(sheet).toMatch(/const \[timeWanted, setTimeWanted\] = useState\(''\);/);
    const date = sheet.indexOf('id="wi-date"');
    const time = sheet.indexOf('id="wi-time"');
    expect(time).toBeGreaterThan(date);
    expect(sheet).toMatch(/<span className="field-optional">\{tCommon\('optional'\)\}<\/span>\s*<\/label>\s*<input\s+id="wi-time"/);
  });

  it('setting one makes it a booking, so the phone is required', () => {
    expect(sheet).toMatch(/const mode: VisitMode = dateChosen \|\| timeWanted !== '' \? 'later' : 'now';/);
    expect(sheet).toMatch(/required=\{later\}/);
  });

  it('a time before now today is kept as typed and flagged, never moved (GRW-531: AM must stay selectable)', () => {
    expect(sheet).toMatch(/const timePassed = day === todayIso && timeWanted !== '' && timeWanted < nowHm;/);
    expect(sheet).toMatch(/onChange=\{\(e\) => setTimeWanted\(e\.target\.value\)\}/);
    expect(sheet).not.toMatch(/\? nowHm : v/);
    expect(sheet).toMatch(/\{timePassed && \(/);
    expect(sheet).toMatch(/if \(timePassed\) return;/);
  });

  it('timePassed is declared AFTER `day` — reading it earlier crashes the screen (temporal dead zone)', () => {
    expect(sheet.indexOf('const timePassed')).toBeGreaterThan(sheet.indexOf('const [day, setDay]'));
  });

  it('has its message in both languages', () => {
    for (const l of ['en', 'hi']) {
      const m = JSON.parse(readFileSync(resolve(__dirname, `../../../messages/${l}.json`), 'utf8')) as { newVisit: Record<string, string> };
      expect(m.newVisit.timePassed).toBeTruthy();
    }
  });

  it('the time step selects that slot if free, else the first free one after it', () => {
    expect(sheet).toMatch(/hm\.format\(new Date\(sl\.utc\)\) >= timeWantedRef\.current/);
    expect(sheet).toMatch(/if \(next\) setSlotUtc\(next\.utc\);/);
    // The Book again card's own pick still wins.
    expect(sheet.indexOf('if (wanted && r.sections.some')).toBeLessThan(sheet.indexOf('timeWantedRef.current) {'));
  });

  it('has its words in both languages', () => {
    for (const lang of ['en', 'hi']) {
      expect(readFileSync(resolve(__dirname, `../../../messages/${lang}.json`), 'utf8')).toMatch(/"bookingTime": "[^"]+"/);
    }
  });
});

describe('the time field wears the same chrome as the date field', () => {
  it('is in the shared field rule, so it is not a bare browser default', () => {
    const css = readFileSync(resolve(__dirname, '../styles/11-availability.css'), 'utf8');
    const rule = css.slice(css.indexOf("select,\ninput[type='text']"), css.indexOf('textarea {'));
    expect(rule).toContain("input[type='time']");
  });
});
