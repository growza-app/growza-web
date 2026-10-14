import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';

/**
 * Jira GRW-572 — New booking in three panels on a wide desk.
 *
 * It is the one-column form with room, not a second booking form: the same hooks, the same `submit` /
 * `queueIt`, the same client block and When controls, drawn side by side. These pin the seams that make that
 * true, and the width rule that keeps phones and narrow laptops exactly as they were.
 */
const here = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const wrapper = here('./NewBookingClient.tsx');
const sheet = here('../../components/NewVisitSheet.tsx');
const unpaid = here('./DeskUnpaid.tsx');
const css = here('../../styles/79-desk-booking.css');
const globals = here('../../globals.css');

describe('New booking on a wide desk', () => {
  it('is asked for only at the desktop tier, never for Record payment, and waits the same one frame as the till', () => {
    expect(wrapper).toMatch(/desk=\{purpose !== 'payment' && wide && layout === 'desk'\}/);
    // The width is read for every purpose now, in the one effect that paints both answers together.
    expect(wrapper).not.toMatch(/if \(!quick\) return;/);
    expect(wrapper).toMatch(/if \(!quick && purpose !== 'payment' && layout === 'unknown'\) return <div className="walk-in-page" aria-busy="true" \/>;/);
    expect(sheet).toMatch(/const deskForm = bookForm && desk;/);
    expect(css).toMatch(/^@media \(min-width: 1101px\) \{/m);
    expect(css).not.toMatch(/max-width: 860px/);
    expect(globals.indexOf('79-desk-booking.css')).toBeGreaterThan(globals.indexOf('79-desk-till.css'));
  });

  it('draws the phone form\'s own pieces, and the till\'s grid, with no second save path', () => {
    const desk = sheet.slice(sheet.indexOf('if (deskForm && onForm) {'), sheet.indexOf('return (\n    <>\n      {/* Jira GRW-478'));
    expect(desk.length).toBeGreaterThan(0);
    for (const piece of ['{clientCombo}', '{clientFields}', 'stylistField', '{whenChoices}', '{goButton}', '{pageHead}']) expect(desk).toContain(piece);
    for (const cls of ['pf-wide-grid', 'pf-wide-left', 'pf-wide-right']) expect(desk).toContain(cls);
    // The menu is the till's tiles, driven by the one-column form's own counters.
    expect(desk).toMatch(/<DeskServiceGrid\s+services=\{services\}\s+countOf=\{countOnBill\}\s+onMore=\{addOneMore\}\s+onLess=\{removeOneOf\}/);
    expect(desk).toMatch(/onPickPackage=\{\(o\) => \(offerId === o\.id \? removeCombo\(\) : applyCombo\(o\)\)\}/);
    // The lines are the till's rows: a package is one row, and taking it off takes the whole package.
    expect(desk).toMatch(/onLess=\{\(key\) => \(comboActive && key === offerId \? removeCombo\(\) : removeOneOf\(key\)\)\}/);
    // Nothing in the desk block calls the API itself: the writes stay in `submit` and `queueIt`.
    expect(desk).not.toMatch(/api\./);
    // The one column and the desk share ONE button; the tray no longer builds its own.
    expect((sheet.match(/const goButton = \(/g) ?? []).length).toBe(1);
    expect(sheet).toMatch(/\{trayTotal \? <div className="wi-tray-row">\{trayTotal\}\{goButton\}<\/div> : goButton\}/);
  });

  it('asks the stylist under What now?, so a tap on the right never changes the left column', () => {
    const desk = sheet.slice(sheet.indexOf('if (deskForm && onForm) {'), sheet.indexOf('return (\n    <>\n      {/* Jira GRW-478'));
    const left = desk.slice(desk.indexOf('<aside className="pf-wide-left">'), desk.indexOf('</aside>'));
    expect(left).not.toContain('stylistField');
    expect(desk).toMatch(/\{whenChoices\}\s*\{queueing \? null : <div className="wi-desk-stylist">\{stylistField\}<\/div>\}/);
    expect(css).toMatch(/\.wi-desk \.wi-desk-stylist \{\s*order: 1;/);
  });

  it('lists who is in today as rows that only say, so a half-filled booking is never lost to a tap', () => {
    expect(sheet).toMatch(/<DeskUnpaid location=\{listBranch\} timezone=\{timezone\} title=\{nv\.deskToday\} empty=\{nv\.deskNobodyToday\} still \/>/);
    expect(unpaid).toMatch(/still \? \(\s*<div className="pf-wide-row pf-wide-row-still">/);
    // The till keeps its tap: its rows still open the sale.
    expect(unpaid).toMatch(/onClick=\{\(\) => router\.push\(r\.href\)\}/);
  });

  it('has its words in both languages', () => {
    for (const key of ['deskToday', 'deskOnVisit', 'deskEmpty', 'deskNobodyToday']) {
      expect((en.newVisit as Record<string, string>)[key]).toBeTruthy();
      expect((hi.newVisit as Record<string, string>)[key]).toBeTruthy();
    }
  });
});
