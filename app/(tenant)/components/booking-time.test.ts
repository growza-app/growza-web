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

  it('cannot be before now today: the field says so and a typed earlier time is moved to now', () => {
    expect(sheet).toMatch(/min=\{day === todayIso \? nowHm : undefined\}/);
    expect(sheet).toMatch(/setTimeWanted\(day === todayIso && v && v < nowHm \? nowHm : v\);/);
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
