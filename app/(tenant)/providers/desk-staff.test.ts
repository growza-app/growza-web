import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-14 — Staff on a wide desk: three panels, as Services and Clients. The summary and the tabs on
 * the left, the roster in the middle, the picked person's actions in place on the right. Editing stays the full
 * screen (design Turn 4). Source-regex pins, as the rest.
 */
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const client = read('StaffClient.tsx');
const roster = read('StaffRoster.tsx');
const css = read('../styles/79-desk-staff.css');

describe('Staff on a desk', () => {
  it('decides by the window, at the desktop tier, and draws nothing until it knows', () => {
    expect(client).toMatch(/window\.matchMedia\('\(min-width: 1101px\)'\)/);
    expect(client).toMatch(/if \(desk === null\) \{[\s\S]*?<div className="page-body" aria-busy="true" \/>/);
  });

  it('is the three panels of the till', () => {
    expect(client).toMatch(/<div className="page-body staff-desk">/);
    expect(client).toMatch(/<div className="pf-wide-grid staff-desk-grid">/);
    expect(client).toMatch(/<aside className="pf-wide-left staff-desk-left"/);
    expect(client).toMatch(/<section className="pf-wide-mid staff-desk-mid"/);
    expect(client).toMatch(/<aside className="pf-wide-right staff-desk-right"/);
  });

  it('the left panel is the three figures and the tabs with their counts', () => {
    expect(client).toMatch(/<dl className="staff-desk-kpis">/);
    expect(client).toMatch(/\{tabs\.map\(\(tb\) => \([\s\S]*?className=\{`pf-wide-tab \$\{tab === tb\.key \? 'is-on' : ''\}`\}[\s\S]*?onClick=\{\(\) => changeTab\(tb\.key\)\}/);
  });

  it('the roster is the page\'s own, in a scrolling panel; the header and dialogs are shared with the page', () => {
    expect(client).toMatch(/<div className="staff-desk-scroll">\{roster\}<\/div>/);
    expect(client).toMatch(/\{header\}\s*<div className="page-body">/);
    expect(client).toMatch(/\{dialogs\}\s*<\/div>\s*<\/>\s*\);\s*\}/);
  });

  it('a row picks the person on a desk; on a phone the card opens the sheet, as before', () => {
    expect(client).toMatch(/selectedId=\{desk \? \(sheetFor\?\.id \?\? null\) : null\}\s*onSelect=\{desk \? setSheetFor : undefined\}/);
    expect(client).toMatch(/\{sheetFor && !desk && \(\s*<StaffActionSheet/);
    expect(roster).toMatch(/if \(\(e\.target as HTMLElement\)\.closest\('button, a, label, input'\)\) return;\s*onSelect\(p\);/);
    expect(roster).toMatch(/className=\{`staff-row \$\{off \? 'is-off' : ''\} \$\{selected \? 'is-selected' : ''\}`\}/);
  });

  it('the right panel is the action sheet drawn in place: no backdrop, no trap, an action keeps the pick', () => {
    expect(client).toMatch(/<StaffActionSheet p=\{picked\} actions=\{actions\} inline onClose=\{\(\) => setSheetFor\(null\)\} \/>/);
    expect(roster).toMatch(/useDialog\(dialogRef, \{ onClose: inline \? undefined : onClose, active: !inline \}\);/);
    expect(roster).toMatch(/const run = \(fn: \(\) => void\) => \(\) => \{\s*if \(!inline\) onClose\(\);\s*fn\(\);/);
    expect(roster).toMatch(/\{!inline && <div className="sheet-backdrop" onClick=\{onClose\} \/>\}/);
    expect(roster).toMatch(/className=\{inline \? 'sheet sheet-inline staff-sheet-inline' : 'sheet'\}\s*role=\{inline \? 'region' : 'dialog'\}/);
  });

  it('editing stays the full screen', () => {
    expect(client).toMatch(/onEdit: \(p\) => router\.push\(`\/providers\/\$\{p\.id\}`\)/);
    expect(css).toMatch(/Editing a person stays the full screen/);
  });

  it('the compact row and the narrow band', () => {
    expect(css).toMatch(/\.staff-desk \.staff-identity \{\s*width: auto;\s*flex: 1 1 11rem;/);
    // The shift column is sized to its content, so a free day's chip never runs under the switch.
    expect(css).toMatch(/\.staff-desk \.staff-shift \{\s*width: auto;\s*flex: 0 0 auto;\s*max-width: 15rem;/);
    expect(css).toMatch(/\.staff-desk \.staff-row\.is-selected \{\s*border-color: var\(--accent\);/);
    expect(css).toMatch(/@media \(min-width: 1101px\) and \(max-width: 1300px\) \{[\s\S]*?\.staff-desk \.staff-shift-bar,\s*\.staff-desk \.staff-shift-head \.staff-badge-free \{\s*display: none;/);
    expect(css).toMatch(/@media \(min-width: 1101px\) and \(max-width: 1300px\) \{[\s\S]*?\.staff-desk \.staff-identity-name \.staff-badge-in,\s*\.staff-desk \.staff-identity-name \.staff-badge-invited \{\s*display: none;/);
  });

  it('is loaded after the Clients desk sheet, and says it in both languages', () => {
    const globals = read('../globals.css');
    expect(globals.indexOf('79-desk-clients.css')).toBeLessThan(globals.indexOf('79-desk-staff.css'));
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(readFileSync(join(__dirname, `../../../messages/${lang}.json`), 'utf8'));
      expect(m.staff.deskPick, lang).toMatch(/\{label\}/);
      for (const k of ['deskWorking', 'deskPeople', 'deskSeats']) expect(typeof m.staff[k], `${lang} ${k}`).toBe('string');
      expect(typeof m.staff.row.closeActions, lang).toBe('string');
      expect(m.services.deskPick, lang).not.toMatch(/\{label\}/);
    }
  });
});
