import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Design review, 2026-10-07 — what the Settings section was asked to fix, pinned so it stays fixed.
 *
 * Each of these was a finding against Apple's HIG, checked in a browser at 375px and 1280px. `NewVisitSheet`'s
 * own tests read source the same way: these screens are client components with no DOM in this environment.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const nav = read('SettingsNavList.tsx');
const settingsCss = read('../styles/28-settings.css');
const fitCss = read('../styles/85-settings-fit.css');

describe('the list says where you are', () => {
  /**
   * "A table that helps people navigate through a hierarchy persistently highlights the selected row to
   * clarify the path people are taking" (HIG, Lists and tables › Best practices). At 1280px every one of the
   * eleven rows was identical whichever screen was open.
   */
  it('marks the open row, for the eye and for a screen reader', () => {
    expect(nav).toMatch(/const here = usePathname\(\);/);
    expect(nav).toMatch(/aria-current=\{current \? 'page' : undefined\}/);
    expect(nav).toMatch(/settings-row-current/);
    expect(settingsCss).toMatch(/\.settings-row-current,\s*\n\.settings-row-current:hover \{\s*\n\s*background: var\(--accent-soft\);/);
    // Never the fill alone: "convey information with more than color alone" (HIG, Accessibility › Vision).
    expect(settingsCss).toMatch(/\.settings-row-current \.settings-row-title \{[^}]*font-weight: 700;/);
  });

  it('compares the path, not the query — `?branch=` picks a branch, not a screen', () => {
    expect(nav).toMatch(/const path = href\.split\('\?'\)\[0\] \?\? href;/);
  });
});

describe('the list is a list', () => {
  /** "Use a label or a header to help people understand the context" (HIG, Lists and tables › Content). */
  it('is a section with a real heading over real list items', () => {
    expect(nav).toMatch(/<section className="settings-group" key=\{group\.key\} aria-labelledby=\{`settings-group-\$\{group\.key\}`\}>/);
    expect(nav).toMatch(/<h2 className="settings-group-title" id=\{`settings-group-\$\{group\.key\}`\}>/);
    expect(nav).toMatch(/<ul className="menu-list">/);
    expect(nav).not.toMatch(/<div className="settings-group-title">/);
  });

  it('keeps the divider, which the old adjacent-row selector no longer reaches', () => {
    expect(settingsCss).toMatch(/\.settings-group \.menu-list li \+ li \.settings-row \{\s*\n\s*border-top:/);
    expect(settingsCss).not.toMatch(/\.settings-row \+ \.settings-row \{/);
    expect(settingsCss).toMatch(/\.settings-group \.menu-list \{[^}]*list-style: none;/);
  });
});

describe('the header names the screen', () => {
  const header = read('SettingsHeader.tsx');

  it('takes the label from the same row the list draws', () => {
    expect(header).toMatch(/SETTINGS_GROUPS\.flatMap\(\(g\) => g\.rows\)\.find\(/);
    expect(header).toMatch(/title=\{key \? t\(`rows\.\$\{key\}\.label`\) : sectionTitle\}/);
    // The hub keeps "Settings": there the list IS the screen.
    expect(read('layout.tsx')).toMatch(/<SettingsHeader sectionTitle=\{title\} subtitle=\{t\('subtitle'\)\} \/>/);
  });
});

describe('saving', () => {
  const hours = read('working-hours/WorkingHoursForm.tsx');
  const reminders = read('notifications/RemindersForm.tsx');

  /** Two forms on one screen both said "Save changes"; pressing one dropped the other with nothing said. */
  it('names what each save keeps, on the screen that has two of them', () => {
    expect(hours).toMatch(/saveLabel=\{t\('saveHours'\)\}/);
    expect(hours).toMatch(/saveLabel=\{t\('saveAttendance'\)\}/);
    for (const [lang, m] of [['en', en], ['hi', hi]] as const) {
      const s = (m as unknown as { settingsHours: Record<string, string> }).settingsHours;
      expect(s.saveHours, `${lang}.saveHours`).toBeTruthy();
      expect(s.saveAttendance, `${lang}.saveAttendance`).toBeTruthy();
      expect(s.saveHours).not.toBe(s.saveAttendance);
    }
  });

  it('uses the one save bar, not a hand-rolled copy of it', () => {
    for (const src of [hours, reminders]) {
      expect(src).toMatch(/<SettingsSaveBar/);
      // GRW-416 built the component to end exactly this inline row; two screens still carried it.
      expect(src).not.toMatch(/marginTop: 16, display: 'flex', alignItems: 'center', gap: 12/);
    }
  });

  it('pins one bar to a phone’s edge, never two', () => {
    expect(hours.match(/pinned=\{false\}/g)).toHaveLength(2);
    expect(fitCss).toMatch(/\.settings-savebar-pinned \{\s*\n\s*position: sticky;/);
    expect(fitCss).not.toMatch(/\n\s*\.settings-savebar \{\s*\n\s*position: sticky;/);
  });
});

describe('the screen leads with what it is for', () => {
  /** "Place the most important items near the top" (HIG, Layout › Visual hierarchy). */
  it('puts the branch-scope note under the settings it applies to', () => {
    for (const p of ['booking/page.tsx', 'notifications/page.tsx', 'report-access/page.tsx', 'working-hours/page.tsx']) {
      const src = read(p);
      const note = src.indexOf('<BranchScopeNote');
      const form = src.search(/<(BookingRulesForm|RemindersForm|ReportAccessForm|WorkingHoursForm)/);
      expect(note, p).toBeGreaterThan(-1);
      expect(form, p).toBeGreaterThan(-1);
      expect(note, p).toBeGreaterThan(form);
    }
  });

  /** "Offer choices instead of requiring text entry" (HIG, Entering data › Best practices). */
  it('offers the slot length as a choice, keeping any value already saved', () => {
    const form = read('booking/BookingRulesForm.tsx');
    expect(form).toMatch(/const SLOT_CHOICES = \[10, 15, 20, 30, 45, 60\];/);
    expect(form).toMatch(/\[\.\.\.new Set\(\[\.\.\.SLOT_CHOICES, slotGranularityMin\]\)\]/);
    expect(form).toMatch(/<select\s*\n\s*id="rule-slot"/);
    expect(form).not.toMatch(/<input id="rule-slot"\s*\n\s*type="number"/);
  });

  /** The header names the branch two rows above; the group title's job is the contrast below it. */
  it('does not print the branch name twice on the hub', () => {
    expect(nav).toMatch(/t\('groups\.thisBranch'\)/);
    for (const [lang, m] of [['en', en], ['hi', hi]] as const) {
      const g = (m as unknown as { settingsHub: { groups: Record<string, string | undefined> } }).settingsHub.groups;
      expect(g.thisBranch, `${lang}.groups.thisBranch`).toBeTruthy();
      expect(g.branchNamed, `${lang}.groups.branchNamed`).toBeUndefined();
      expect(g.thisBranch).not.toMatch(/\{name\}/);
    }
  });
});
