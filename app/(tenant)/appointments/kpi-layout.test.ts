import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-10 · GRW-455 — the Bookings headline row: equal tiles on one row, at every width.
 *
 * 2026-10-04 — three of them or four. "Didn't come" is the one tile whose normal value is nought,
 * so it is drawn on the days it has something to report and the row shares itself out among
 * whatever is there (`auto-fit` + `grid-auto-flow: column`). The tiles are also the status filter,
 * which this file now pins is SAID in words when one of them is holding the list down.
 *
 * It used to be `repeat(4, 1fr) 1.6fr`: four counts and the "at a glance" metric card as a wider fifth column.
 * GRW-10 is what that cost — between 861px and about 1150px the fifth cell was too narrow and the row overflowed
 * its container by 75px at 861, 32px at 1024 and 12px at 1100, failing FR-02's "no overflow at 1024px or below" —
 * and the fix was a media query giving the card a full-width row of its own in that band, as the phone layout
 * already did.
 *
 * GRW-455 removed the card ("this is not required"), so the grid is four columns everywhere and the band needs no
 * special case. There is no browser harness in this repo, so what is asserted here is the rule itself: one grid,
 * no fifth column, and nothing left of the card to reflow.
 */
const css = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../styles/32-customers.css'),
  'utf-8',
);

describe('the Bookings KPI row', () => {
  it('shares the row among the tiles that are drawn, not among four slots', () => {
    // 2026-10-04 — "Didn't come" is left out on a day when nobody did, and with `repeat(4, …)` the
    // three that remained kept their 84px and left a quarter of the row empty. Measured at 390px:
    // 84px each before, 114px after.
    expect(css).toMatch(/^\.bk-kpis\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(0,\s*1fr\)\)\s*;/m);
    // `auto-fit` alone would stack them; the tiles stay on one row whatever their number.
    expect(css).toMatch(/^\.bk-kpis\s*\{[^}]*grid-auto-flow:\s*column;/m);
  });

  it('draws the "Didn\'t come" tile only when somebody did not come', () => {
    const list = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), './BookingsList.tsx'),
      'utf-8',
    );
    expect(list).toMatch(/\{countIn\('no_show'\) > 0 && \(/);
    // The other three always say something about the day, so they are always drawn.
    expect(list).not.toMatch(/countIn\('confirmed'\) > 0 &&/);
  });

  it('has no fifth, wider column any more', () => {
    expect(css).not.toMatch(/repeat\(4,\s*minmax\(0,\s*1fr\)\)\s*1\.6fr/);
  });

  it('needs no reflow band between 861px and five-across', () => {
    // The band existed only to move the metric card out of a cell too narrow for it.
    expect(css).not.toContain('@media (min-width: 861px) and (max-width: 1149px)');
  });

  it('keeps the count tiles on one row on the phone too', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 860px)'));
    expect(phone).toMatch(/\.bk-kpis\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(0,\s*1fr\)\)/);
    expect(phone).toMatch(/\.bk-kpis\s*\{[^}]*grid-auto-flow:\s*column;/);
  });

  it('says in words when a tile is filtering the list, and offers the way back', () => {
    const list = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), './BookingsList.tsx'),
      'utf-8',
    );
    // A tile is a figure and a control at once; the outline it takes is easy to miss among four.
    expect(list).toMatch(/<div className="bk-status-on" role="status">/);
    expect(list).toMatch(/t\('showingOnly', \{ status: statusWord\(statusFilter\)! \}\)/);
    expect(list).toMatch(/setStatusFilter\(''\);/);
    expect(css).toMatch(/\.bk-status-on \{[^}]*min-height:\s*44px;/);
  });

  it('the booking reference is on a card only when there is no name to show', () => {
    const list = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), './BookingsList.tsx'),
      'utf-8',
    );
    // It sits in the booking's own sheet, and search still matches on it.
    expect(list).toMatch(/clientNameLabel\(b\) !== null \? \(\s*<div className="bk-card-name">[\s\S]{0,120}<span className="bk-card-ref">/);
    expect(list).toMatch(/bookingRef\(b\.appointments\[0\]!\.id\)[\s\S]{0,80}\.some\(|bookingRef\(b\.appointments\[0\]!\.id\), b\.customerName/);
  });

  it('leaves nothing of the metric card behind', () => {
    expect(css).not.toMatch(/\.bk-metric/);
  });
});
