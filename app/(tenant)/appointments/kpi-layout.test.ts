import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-10 · GRW-455 — the Bookings headline row: equal tiles on one row, at every width.
 *
 * Jira GRW-488 — the tiles are gone. They are a segmented control now (All · To do · Completed),
 * which is where their rules live; see `kpi-tiles.test.ts`. What stays here is the history of the
 * row that preceded it, and the two checks that outlived the tiles themselves.
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


  it('has no fifth, wider column any more', () => {
    expect(css).not.toMatch(/repeat\(4,\s*minmax\(0,\s*1fr\)\)\s*1\.6fr/);
  });

  it('needs no reflow band between 861px and five-across', () => {
    // The band existed only to move the metric card out of a cell too narrow for it.
    expect(css).not.toContain('@media (min-width: 861px) and (max-width: 1149px)');
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
