import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-343 — the phone's staff table on Bookings.
 *
 * Rendered in a browser with fake staff and bookings (the dev tenant has none): the figures, tap to filter, tap the
 * picked row to clear, Enter on the keyboard, and every column inside the box at 393, 360, 344 and 320px. The sums
 * are in lib/staff-summary.test.ts; these pin the wiring and the two traps that bit.
 */
const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('the staff table', () => {
  const table = src('StaffTable.tsx');
  const list = src('BookingsList.tsx');
  const css = src('../styles/93-staff-table.css');

  it('is a real table, with column heads and each person as a row head', () => {
    expect(table).toMatch(/<table className="bk-staff-table">/);
    expect(table).toMatch(/<th scope="col">/);
    expect(table).toMatch(/<th scope="row">/);
    expect(table).toMatch(/<caption className="sr-only">/);
  });

  it('a row is one toggle: the tap lands on the row, the name button is the keyboard\'s, and it clicks once', () => {
    expect(table).toMatch(/<tr[\s\S]*onClick=\{\(\) => onPick\(on && !total \? 'Everyone' : pick\)\}/);
    expect(table).toMatch(/<button type="button" aria-pressed=\{on\}>/);
    // no handler on the name button itself — its click bubbles to the row, and a second one would toggle straight back
    expect(table).not.toMatch(/<button type="button" aria-pressed=\{on\}[^>]*onClick/);
  });

  it('the picked row goes back to Everyone; the Everyone row itself never clears', () => {
    expect(table).toMatch(/on && !total \? 'Everyone' : pick/);
  });

  it('replaces the chips on Bookings, hidden from a stylist looking at their own calendar', () => {
    expect(list).toMatch(/\{!viewerIsStaff && \(\s*<StaffTable/);
    expect(list).not.toMatch(/bk-staff-chip/);
    expect(src('../styles/32-customers.css')).not.toMatch(/bk-staff-chip/);
  });

  it('the last column is "Next" today and "First" on any other day', () => {
    expect(table).toMatch(/upcoming \? labels\.next : labels\.first/);
    expect(list).toMatch(/staffRows\(bookings, providers\.map\(\(p\) => p\.displayName\), now, isToday\)/);
  });

  it('is phone-only, and beats the global `table { min-width: 560px }` that pushed two columns off screen', () => {
    expect(css).toMatch(/\.bk-staff-table-wrap\s*\{\s*display:\s*none;/);
    expect(css).toMatch(/@media \(max-width: 860px\)/);
    expect(css).toMatch(/\.bk-staff-table\s*\{[^}]*min-width:\s*0;/);
    expect(css).toMatch(/table-layout:\s*fixed/);
  });

  it('a row is a 44px target and the list scrolls inside its own box with the heads kept in view', () => {
    expect(css).toMatch(/tbody th,\s*\.bk-staff-table tbody td\s*\{[^}]*height:\s*44px/);
    expect(css).toMatch(/max-height:[^;]+;\s*overflow-y:\s*auto/);
    expect(css).toMatch(/thead th\s*\{[^}]*position:\s*sticky/);
  });

  it('the schedule heading is an h2 under the page\'s h1 — an h3 skipped a level', () => {
    expect(list).toMatch(/<div className="bk-sched-head">\s*<h2>/);
  });

  it('has its words in the message files, in both languages', () => {
    for (const f of ['../../../messages/en.json', '../../../messages/hi.json']) {
      const m = JSON.parse(src(f)).bookings;
      for (const k of ['staffTableCaption', 'staffColBooked', 'staffColNext', 'staffColFirst', 'staffEveryone']) expect(m[k], `${f} ${k}`).toBeTruthy();
    }
  });

  describe('the number of bookings opens a sheet of who they are for', () => {
    const table = src('StaffTable.tsx');
    const sheet = src('StaffVisitsSheet.tsx');
    const css = src('../styles/93-staff-table.css');
    const sheetCss = src('../styles/22-bottom-sheet.css');

    it('is a button with a name that says whose and how many — and there is none for 0', () => {
      expect(table).toMatch(/row\.bookings > 0 \? \(\s*<button\s+type="button"\s+className="bk-count-btn"\s+aria-haspopup="dialog"\s+aria-label=\{`\$\{label\}: \$\{labels\.count\(row\.bookings\)\}`\}/);
      expect(table).toMatch(/<span className="bk-count-none">/);
    });

    it('opens the sheet WITHOUT also picking the row', () => {
      expect(table).toMatch(/e\.stopPropagation\(\); \/\/ opens the sheet; it must not also pick the row\s*setSheetFor\(pick\);/);
    });

    it('"Everyone" lists every visit and says who each is with; a person\'s own does not repeat their name', () => {
      expect(table).toMatch(/showStaff=\{sheetFor === 'Everyone'\}/);
      expect(sheet).toMatch(/showStaff && v\.staff \? ` · \$\{v\.staff\}` : ''/);
    });

    it('shows time, client and service — and no name at all when the salon withholds it', () => {
      expect(sheet).toMatch(/formatTime\(v\.startAt, timezone\)/);
      expect(sheet).toMatch(/\{v\.client \? <strong>\{v\.client\}<\/strong> : null\}/);
      expect(sheet).toMatch(/v\.client \? 'bk-visit-service' : 'bk-visit-service is-lead'/);
    });

    it('says so when there is nothing booked', () => {
      expect(sheet).toMatch(/visits\.length === 0 \? \(\s*<p className="bk-staff-nothing">\{labels\.nothing\}/);
    });

    it('is a modal dialog: named, focus in, Tab kept inside, Escape and the backdrop close it, focus returns', () => {
      expect(sheet).toMatch(/role="dialog" aria-modal="true" aria-labelledby="bk-visits-title"/);
      expect(sheet).toMatch(/useDialog\(dialogRef, \{ onClose \}\)/);
      expect(sheet).toMatch(/className="sheet-backdrop sheet-backdrop-fade" onClick=\{onClose\}/);
    });

    it('is portalled to the body, so no scrolling or stacking ancestor can trap it under the header or the bar', () => {
      expect(sheet).toMatch(/createPortal\(/);
    });

    it('slides up from the bottom edge, and the backdrop fades in', () => {
      expect(sheet).toMatch(/className="sheet sheet-rise bk-visits-sheet"/);
      expect(sheetCss).toMatch(/@keyframes sheet-rise\s*\{\s*from\s*\{\s*transform:\s*translateY\(100%\)/);
      expect(sheetCss).toMatch(/\.sheet-rise\s*\{\s*animation:\s*sheet-rise/);
    });

    it('the chip is a 44px target, the table no longer opens out inline, and a long name wraps', () => {
      expect(css).toMatch(/\.bk-count-btn\s*\{[^}]*min-width:\s*44px;[^}]*height:\s*44px/);
      expect(css).not.toMatch(/bk-staff-detail/);
      expect(table).not.toMatch(/bk-staff-detail/);
      expect(css).toMatch(/\.bk-visit-who strong\s*\{[^}]*overflow-wrap:\s*anywhere/);
    });

    it('has its words in the message files, in both languages', () => {
      for (const f of ['../../../messages/en.json', '../../../messages/hi.json']) {
        expect(JSON.parse(src(f)).bookings.staffSheetClose, f).toBeTruthy();
      }
    });
  });
});
