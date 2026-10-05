import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-518 — New booking asks for the Booking date on its first screen: today unless changed, never
 * before today, and a later day makes the visit "For later". The same `day` the when-step already uses.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));
const css = strip(readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8'));

describe('the Booking date', () => {
  it('is a date field on the first screen, defaulting to today and not allowing the past', () => {
    expect(sheet).toMatch(/const \[day, setDay\] = useState\(todayIso\);/);
    expect(sheet).toMatch(/<input\s+id="wi-date"\s+type="date"\s+min=\{todayIso\}\s+value=\{day\}/);
    // A typed past date is clamped, not accepted.
    expect(sheet).toMatch(/const next = v < todayIso \? todayIso : v;/);
  });

  it('a later date makes it "For later"; "Walk-in now" puts the date back to today', () => {
    expect(sheet).toMatch(/if \(next > todayIso\) setMode\('later'\);/);
    expect(sheet).toMatch(/const chooseMode = \(m: VisitMode\) => \{\s*setMode\(m\);\s*if \(m === 'now'\) setDay\(todayIso\);/);
    // Every way of choosing the mode goes through it: both tabs and the arrow keys.
    expect(sheet).toMatch(/chooseMode\(otherIndex === 0 \? 'now' : 'later'\)/);
    expect(sheet).toMatch(/onClick=\{\(\) => chooseMode\('now'\)\}/);
    expect(sheet).toMatch(/onClick=\{\(\) => chooseMode\('later'\)\}/);
  });

  it('a date past the week still shows, selected, on the when-step', () => {
    expect(sheet).toMatch(/if \(!week\.some\(\(d\) => d\.iso === day\)\) week\.push\(/);
    expect(sheet).toMatch(/\}, \[timezone, day\]\);/);
  });

  it('the add block has no heading, no icon and no margin of its own', () => {
    expect(sheet).not.toMatch(/IconUserPlus|nv\.addNew/);
    expect(css).toMatch(/\.wi-new-person \{\s*margin: 0;\s*\}/);
    expect(css).not.toMatch(/\.wi-new-person \{[^}]*(?:border-top|padding-top|margin-top)/);
  });

  it('has its words in both languages', () => {
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(readFileSync(resolve(__dirname, `../../../messages/${lang}.json`), 'utf8')) as {
        services: Record<string, string>;
      };
      expect(JSON.stringify(m)).toMatch(/"bookingDate":/);
      expect(JSON.stringify(m)).not.toMatch(/"addNew":/);
    }
  });
});
