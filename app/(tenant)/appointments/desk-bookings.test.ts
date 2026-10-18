import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Desktop Bookings Command View (≥1101px):
 *   1. Top 4 KPI summary cards (.bk-cmd-summary) synced with actual booking statuses
 *   2. Unified 2-row horizontal toolbar (.bk-cmd-toolbar) with status tabs (All · Confirmed · Completed · Cancelled · Didn't come),
 *      view switcher (Table | Timeline | List), search, date presets (Today · Tomorrow · This week), From/To range, Staff, and Sort
 *   3. 2-column collapsible Waiting Queue panel (.bk-waiting-cmd) that shows the next 2 tokens by default and expands
 *      into a scrollable 2-column grid when "Show all N waiting" is toggled
 *   4. Full-width schedule table (.bk-table) with slide-over detail drawer (.bk-desk-right) when a booking is picked
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
    expect(list).toMatch(/if \(desk\) \{\s*return \(\s*<div className="bk-desk bk-cmd">/);
  });

  it('renders the top 4 KPI summary strip synced with actual booking status names', () => {
    expect(list).toMatch(/<div className="bk-cmd-summary" role="region" aria-label=\{t\('kpiBookings'\)\}>/);
    expect(list).toContain("t('kpiTotalBookings')");
    expect(list).toContain("ts('confirmed')");
    expect(list).toContain("ts('done')");
    expect(list).toContain("ts('cancelled')");
    expect(css).toMatch(/\.bk-cmd-summary \{\s*display: grid;\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  });

  it('renders the 2-row horizontal toolbar with synced status tabs, view switcher, search, date presets, From/To inputs, staff, and sort', () => {
    expect(list).toMatch(/const deskStatusTabs = \[\s*\{ key: '', label: t\('tab_all'\)/);
    expect(list).toContain("{ key: 'confirmed', label: ts('confirmed'), count: countIn('confirmed') }");
    expect(list).toContain("{ key: 'completed', label: ts('done'), count: countIn('completed') }");
    expect(list).toContain("{ key: 'cancelled', label: ts('cancelled'), count: countInCancelled }");
    expect(list).toContain("{ key: 'no_show', label: ts('didNotCome'), count: countIn('no_show') }");
    expect(list).toMatch(/<div className="bk-cmd-segs" role="tablist" aria-label=\{t\('statusLabel'\)\}>/);
    expect(list).toMatch(/<label className="pf-wide-search bk-cmd-search">/);
    expect(list).toMatch(/<div className="bk-cmd-presets" role="group" aria-label=\{t\('from'\)\}>/);
    expect(list).toMatch(/<form method="get" className="bk-cmd-date-form">/);
  });

  it('renders the 2-column collapsible Waiting Queue panel showing 2 by default and expanding on toggle', () => {
    expect(list).toContain('const shownTokens = waitingExpanded ? waitingFiltered : waitingFiltered.slice(0, 2);');
    expect(list).toContain('<section className="bk-waiting bk-waiting-cmd" aria-label={t(\'waitingTitle\')}>');
    expect(list).toContain('aria-expanded={waitingExpanded}');
    expect(css).toMatch(/\.bk-waiting-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(css).toMatch(/\.bk-waiting-grid\.is-expanded \{\s*max-height: 220px;\s*overflow-y: auto;/);
  });

  it('the phone keeps its page, in the same pieces', () => {
    expect(list).toMatch(/\{earningsCard\}\s*\{unmarkedChip\}\s*\{tabsRow\(\)\}\s*\{findRow\(\)\}\s*\{filterCard\}\s*\{waitingBlock\}/);
    expect(list).toMatch(/<div className="bk-scroll">\{schedBody\}<\/div>\s*\{pager\}/);
    expect(list).toMatch(/\{openSheet\(false\)\}\s*\{giveSheet\}/);
  });

  it('a card or row picks the booking on a desk, and says so; the pick is read fresh and clears when the row leaves the list', () => {
    expect(list).toMatch(/\$\{desk && picked\?\.key === b\.key \? 'is-selected' : ''\}`\}\s*aria-current=\{desk && picked\?\.key === b\.key \? 'true' : undefined\}/);
    expect(list).toMatch(/const liveOpen = open \? \(bookings\.find\(\(g\) => g\.key === open\.key\) \?\? null\) : null;\s*const picked = liveOpen && \(!desk \|\| filtered\.some\(\(g\) => g\.key === liveOpen\.key\)\) \? liveOpen : null;/);
    expect(css).toMatch(/\.bk-desk \.bk-card\.is-selected \{\s*border-color: var\(--accent\);/);
    expect(css).toMatch(/\.bk-desk \.bk-card \.bk-details \{\s*display: none;/);
  });

  it('the slide-over right drawer renders the booking\'s own sheet only when picked, leaving the table full-width otherwise', () => {
    expect(list).toMatch(/\{picked && \(\s*<>\s*<div className="sheet-backdrop bk-desk-backdrop" onClick=\{\(\) => setOpen\(null\)\} \/>\s*<aside className="pf-wide-right bk-desk-right" aria-label=\{noun\}>\s*\{openSheet\(true\)\}\s*<\/aside>\s*<\/>\s*\)\}/);
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

  it('is loaded after the Staff desk sheet, and says it in both languages', () => {
    const globals = read('../globals.css');
    expect(globals.indexOf('79-desk-staff.css')).toBeLessThan(globals.indexOf('79-desk-bookings.css'));
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(readFileSync(join(__dirname, `../../../messages/${lang}.json`), 'utf8'));
      expect(m.bookings.deskPick, lang).toMatch(/\{noun\}/);
      expect(typeof m.bookings.deskNew, lang).toBe('string');
      expect(typeof m.bookings.viewTable, lang).toBe('string');
      expect(typeof m.bookings.kpiTotalBookings, lang).toBe('string');
      expect(typeof m.bookings.waitingShowAll, lang).toBe('string');
    }
  });

  it('defaults to the Table view on a desk with Amount column and direct Complete and View row actions alongside Timeline and List', () => {
    expect(list).toMatch(/useState<'table' \| 'timeline' \| 'list'>\('timeline'\)/);
    expect(list).toMatch(/if \(!viewInitRef\.current && mq\.matches\) \{\s*viewInitRef\.current = true;\s*setView\('table'\);\s*\}/);
    expect(list).toMatch(/<table className="hm-v3-table bk-table">/);
    expect(list).toContain('{anyPricesShown && <th>{hc.colAmount}</th>}');
    expect(list).toMatch(/router\.push\(payVisitHref\(\{ appointmentId: b\.appointments\[0\]!\.id, startAt: b\.startAt \}, timezone, 'bookings'\)\)/);
    expect(css).toMatch(/\.bk-table tbody tr\.is-selected td \{/);
  });

  it('shows a three-dots Edit menu beside View on completed bookings for roles that may correct bookings', () => {
    expect(list).toContain("useMayUse('booking.correct')");
    expect(list).toContain("b.status === 'completed'");
    expect(list).toContain('className="hm-v3-row-dots bk-row-dots"');
    expect(list).toContain("t('editBooking')");
    expect(list).toContain('<CorrectBookingSheet');
  });
});

