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
  it('is a date field on the first screen, showing today and not allowing the past (Jira GRW-521)', () => {
    expect(sheet).toMatch(/<input\s+id="wi-date"\s+type="date"\s+min=\{todayIso\}\s+value=\{day\}/);
    // A typed or cleared past/empty date is clamped to today, not accepted.
    expect(sheet).toMatch(/const next = !v \|\| v < todayIso \? todayIso : v;/);
    expect(sheet).toMatch(/if \(!dateChosen\) return todayIso;/);
  });

  it('today is a walk-in, a later day is a booking; back to today or cleared is a walk-in again', () => {
    expect(sheet).toMatch(/setDay\(next\);\s*setDateChosen\(next > todayIso\);/);
    expect(sheet).toMatch(/const mode: VisitMode = dateChosen \? 'later' : 'now';/);
    expect(sheet).toMatch(/<span className="field-optional">\{tCommon\('optional'\)\}<\/span>/);
  });

  it('a link that asks for a later booking starts on tomorrow, and Book again counts as a booking', () => {
    expect(sheet).toMatch(/d\.setUTCDate\(d\.getUTCDate\(\) \+ 1\);/);
    expect(sheet).toMatch(/setDay\(time\.day\);\s*(?:\/\/[^\n]*\n\s*)?setDateChosen\(true\);/);
  });

  it('there are no Walk-in / For later tabs, and the flow runs search, name, phone, date, continue', () => {
    expect(sheet).not.toMatch(/wi-segmented|role="tablist"|modeNow|modeLater/);
    const first = sheet.slice(sheet.indexOf("{stage.step === 'client' && ("), sheet.indexOf("(stage.step === 'details' || stage.step === 'saving'"));
    const at = (needle: string) => first.indexOf(needle);
    expect(at('wi-search-input')).toBeGreaterThan(-1);
    expect(at('id="wi-name"')).toBeGreaterThan(at('wi-search-input'));
    expect(at('id="wi-phone"')).toBeGreaterThan(at('id="wi-name"'));
    expect(at('id="wi-date"')).toBeGreaterThan(at('id="wi-phone"'));
    expect(at('nv.useThisPerson')).toBeGreaterThan(at('id="wi-date"'));
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
      expect(JSON.stringify(m)).not.toMatch(/"addNew":|"modeNow":|"modeLater":|"modeLabel":/);
    }
  });
});
