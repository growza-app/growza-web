import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-14 — Bookings on a wide desk: three panels, as Services, Clients and Staff. The filters on the
 * left, the day in the middle, the picked booking's sheet in place on the right. Moving a booking and giving a
 * token stay overlays. Source-regex pins, as the rest.
 */
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const list = read('BookingsList.tsx');
const sheet = read('../components/BookingSheet.tsx');
const summary = read('../components/BookingSummary.tsx');
const css = read('../styles/79-desk-bookings.css');

describe('Bookings on a desk', () => {
  it('decides by the window, at the desktop tier, and draws the page (the server\'s HTML) until it knows', () => {
    expect(list).toMatch(/window\.matchMedia\('\(min-width: 1101px\)'\)/);
    expect(list).not.toMatch(/desk === null/);
    expect(list).toMatch(/if \(desk\) \{\s*return \(\s*<div className="bk-desk pf-wide-grid bk-desk-grid">/);
  });

  it('is the three panels of the till, inside the page body the server drew', () => {
    expect(list).toMatch(/<div className="bk-desk pf-wide-grid bk-desk-grid">/);
    expect(list).toMatch(/<aside className="pf-wide-left bk-desk-left"/);
    expect(list).toMatch(/<section className="pf-wide-mid bk-desk-mid"/);
    expect(list).toMatch(/<aside className="pf-wide-right bk-desk-right"/);
    expect(css).toMatch(/\.page-body\.bk-fit:has\(> \.bk-desk\) \{\s*display: flex;\s*flex-direction: column;\s*overflow: hidden;/);
    // The grid's one row is bounded, so a tall left column scrolls instead of being clipped (matrix, 1280×720).
    expect(css).toMatch(/\.bk-desk-grid \{[\s\S]*?grid-template-rows: minmax\(0, 1fr\);/);
  });

  it('the left panel is the takings, the segments as a list with their counts, and the filter card stacked', () => {
    expect(list).toMatch(/<aside className="pf-wide-left bk-desk-left"[^>]*>\s*\{earningsCard\}/);
    expect(list).toMatch(/<ul className="pf-wide-tabs" role="tablist" aria-label=\{t\('statusLabel'\)\}/);
    expect(list).toMatch(/className=\{`pf-wide-tab \$\{tab === seg \? 'is-on' : ''\}`\}/);
    expect(read('../styles/79-desk-till.css')).toMatch(/\.pf-wide-tab\.is-on \{/);
    expect(list).toMatch(/\{filterCard\}\s*<\/aside>/);
    expect(css).toMatch(/\.bk-desk-left \.bk-filters \{\s*flex-direction: column;/);
    expect(css).toMatch(/\.bk-desk-left \.bk-field-search \{\s*display: none;/);
  });

  it('the middle panel is the search, the day\'s head, and the day scrolling inside it with the waiting first', () => {
    expect(list).toMatch(/<label className="pf-wide-search">/);
    expect(list).toMatch(/\{schedHead\}\s*<div className="bk-scroll bk-desk-scroll">\s*\{waitingBlock\}\s*\{schedBody\}\s*<\/div>\s*\{pager\}/);
    expect(css).toMatch(/\.bk-desk-scroll \{\s*flex: 1;\s*min-height: 0;\s*overflow-y: auto;/);
  });

  it('the phone keeps its page, in the same pieces', () => {
    expect(list).toMatch(/\{earningsCard\}\s*\{unmarkedChip\}\s*\{tabsRow\(\)\}\s*\{findRow\(\)\}\s*\{filterCard\}\s*\{waitingBlock\}/);
    expect(list).toMatch(/<div className="bk-scroll">\{schedBody\}<\/div>\s*\{pager\}/);
    expect(list).toMatch(/\{openSheet\(false\)\}\s*\{giveSheet\}/);
  });

  it('a card picks the booking on a desk, and says so; the pick is read fresh and clears when the row leaves the list', () => {
    expect(list).toMatch(/\$\{desk && picked\?\.key === b\.key \? 'is-selected' : ''\}`\}\s*aria-current=\{desk && picked\?\.key === b\.key \? 'true' : undefined\}/);
    expect(list).toMatch(/const liveOpen = open \? \(bookings\.find\(\(g\) => g\.key === open\.key\) \?\? null\) : null;\s*const picked = liveOpen && \(!desk \|\| filtered\.some\(\(g\) => g\.key === liveOpen\.key\)\) \? liveOpen : null;/);
    expect(css).toMatch(/\.bk-desk \.bk-card\.is-selected \{\s*border-color: var\(--accent\);/);
    // The card is the control, so its Details button goes.
    expect(css).toMatch(/\.bk-desk \.bk-card \.bk-details \{\s*display: none;/);
  });

  it('the right panel is the booking\'s own sheet drawn in place: no backdrop, no trap, a × to clear the pick', () => {
    expect(list).toMatch(/\{picked \? \(\s*openSheet\(true\)\s*\) : \(\s*<div className="bk-desk-nothing">/);
    expect(list).toMatch(/<BookingSummary booking=\{picked\} timezone=\{timezone\} onClose=\{\(\) => setOpen\(null\)\} inline=\{inline\} \/>/);
    expect(list).toMatch(/<BookingSheet\s*inline=\{inline\}/);
    for (const src of [sheet, summary]) {
      expect(src).toMatch(/useDialog\(dialogRef, \{ onClose: inline \? undefined : onClose, active: !inline \}\);/);
      expect(src).toMatch(/\{!inline && <div className="sheet-backdrop" onClick=\{onClose\} \/>\}/);
      expect(src).toMatch(/role=\{inline \? 'region' : 'dialog'\}/);
      expect(src).toMatch(/bk-sheet-inline/);
    }
    expect(sheet).toMatch(/className="icon-btn bk-sheet-close" onClick=\{onClose\} aria-label=\{tc\('close'\)\}/);
  });

  it('moving a booking and giving a token stay overlays', () => {
    expect(sheet).toMatch(/if \(moving\) \{\s*return \(\s*<MoveBookingSheet/);
    expect(list).toMatch(/\{giveSheet\}\s*<\/div>\s*\);\s*\}\s*return \(/);
    expect(css).toMatch(/Moving a booking and giving a token stay the overlays they are/);
  });

  it('the narrow band', () => {
    expect(css).toMatch(/@media \(min-width: 1101px\) and \(max-width: 1300px\) \{[\s\S]*?\.bk-desk \.bk-card-phone \{\s*display: none;/);
  });

  it('is loaded after the Staff desk sheet, and says it in both languages', () => {
    const globals = read('../globals.css');
    expect(globals.indexOf('79-desk-staff.css')).toBeLessThan(globals.indexOf('79-desk-bookings.css'));
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(readFileSync(join(__dirname, `../../../messages/${lang}.json`), 'utf8'));
      expect(m.bookings.deskPick, lang).toMatch(/\{noun\}/);
      expect(typeof m.bookings.deskNew, lang).toBe('string');
      expect(typeof m.bookings.viewTable, lang).toBe('string');
    }
  });

  it('defaults to the Table view on a desk with direct Complete and View row actions alongside Timeline and List', () => {
    expect(list).toMatch(/useState<'table' \| 'timeline' \| 'list'>\('timeline'\)/);
    expect(list).toMatch(/if \(!viewInitRef\.current && mq\.matches\) \{\s*viewInitRef\.current = true;\s*setView\('table'\);\s*\}/);
    expect(list).toMatch(/<table className="hm-v3-table bk-table">/);
    expect(list).toMatch(/router\.push\(payVisitHref\(\{ appointmentId: b\.appointments\[0\]!\.id, startAt: b\.startAt \}, timezone, 'bookings'\)\)/);
    expect(css).toMatch(/\.bk-table tbody tr\.is-selected td \{/);
  });
});

