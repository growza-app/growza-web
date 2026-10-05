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
    expect(sheet).toMatch(/\{nv\.bookingTime\}\s*<\/label>\s*<select id="wi-time"/);
  });

  it('setting one makes it a booking, so the phone is required', () => {
    expect(sheet).toMatch(/const mode: VisitMode = dateChosen \|\| timeWanted !== '' \? 'later' : 'now';/);
    expect(sheet).toMatch(/required=\{later\}/);
  });

  it('is a dropdown of quarter-hours that starts after now today, so a past time cannot be chosen (GRW-533)', () => {
        expect(sheet).toMatch(/const firstMin = day === todayIso \? \(Math\.floor\(\(Number\(nowHm\.slice\(0, 2\)\) \* 60 \+ Number\(nowHm\.slice\(3, 5\)\)\) \/ 15\) \+ 1\) \* 15 : 0/);
    expect(sheet).toMatch(/for \(let m = firstMin; m < 24 \* 60; m \+= 15\)/);
    // The first entry is empty: no time, a walk-in now.
    // Today it shows the current time (GRW-534) and is still no time chosen; another day it reads "Any time".
    expect(sheet).toMatch(/<option value="">\s*\{day === todayIso\s*\? nv\.timeNow\(/);
    expect(sheet).toMatch(/: nv\.anyTime\}\s*<\/option>/);
    expect(sheet).toMatch(/onChange=\{\(e\) => setTimeWanted\(e\.target\.value\)\}/);
    // No free-typed time box, and no "time has passed" message left: it can no longer happen.
    expect(sheet).not.toMatch(/type="time"/);
    expect(sheet).not.toMatch(/timePassed/);
  });

  it('a past time is dropped only when the date comes back to today — never by a clock tick (GRW-535)', () => {
    expect(sheet).toMatch(/if \(next === todayIso && timeWanted && timeWanted < nowHm\) setTimeWanted\(''\);/);
    // The old effect re-read the clock on every render, so a time picked off a stale list snapped back to Now.
    expect(sheet).not.toMatch(/useEffect\(\(\) => \{\s*if \(timeWanted && day === todayIso/);
  });

  it('the list and the Now label are memoised, not rebuilt on every keystroke', () => {
    expect(sheet).toMatch(/const timeOptions = useMemo\(\(\) => \{/);
    expect(sheet).toMatch(/\}, \[firstMin, locale\]\);/);
    expect(sheet).toMatch(/const nowLabel = useMemo\(/);
    expect(sheet).toMatch(/const hmFormat = useMemo\(/);
  });

  it('timeOptions is declared AFTER `day` — reading it earlier crashes the screen (temporal dead zone)', () => {
    expect(sheet.indexOf('const timeOptions')).toBeGreaterThan(sheet.indexOf('const [day, setDay]'));
  });

  it('has its words in both languages', () => {
    for (const l of ['en', 'hi']) {
      const m = JSON.parse(readFileSync(resolve(__dirname, `../../../messages/${l}.json`), 'utf8')) as { newVisit: Record<string, string> };
      expect(m.newVisit.anyTime).toBeTruthy();
      expect(m.newVisit.timeNow).toContain('{time}');
      expect(m.newVisit.timePassed).toBeUndefined();
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

describe('no app-wide time-input style (GRW-535)', () => {
  it('the shared field rule leaves other time inputs (Move booking, Attendance, week hours) alone', () => {
    const css = readFileSync(resolve(__dirname, '../styles/11-availability.css'), 'utf8');
    expect(css).not.toContain("input[type='time']");
  });
});
