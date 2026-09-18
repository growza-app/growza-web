import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-308 — the four tiles on Bookings are the status filter.
 *
 * They were plain figures, and above them sat a strip ("9 bookings have
 * finished and are not marked yet · Show them") that said the same thing as the
 * Confirmed tile in a second place. The strip is gone and the tiles do the job:
 * press Confirmed and the list is the confirmed bookings.
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const list = readFileSync(path.join(dir, 'BookingsList.tsx'), 'utf-8');
const css = readFileSync(path.join(dir, '../styles/32-customers.css'), 'utf-8');

describe('the tiles filter the list', () => {
  it('each status tile is pressed through the same status filter the dropdown uses', () => {
    expect(list).toMatch(/const statusTile = \(status: string\) => \(\{[\s\S]*?setStatusFilter\(statusFilter === status \? '' : status\)/);
    for (const status of ['confirmed', 'completed', 'no_show']) expect(list).toContain(`{...statusTile('${status}')}`);
  });

  it('the Bookings tile is "all", pressed when no status is chosen', () => {
    expect(list).toMatch(/label="Bookings"[\s\S]*?active=\{statusFilter === ''\}/);
  });

  it('a pressed tile says so to a screen reader', () => {
    expect(list).toMatch(/aria-pressed=\{active\}/);
    expect(list).toMatch(/<button type="button" className=\{`bk-kpi bk-kpi-btn/);
  });

  it('the counts do not move when a tile is pressed — they count what is in view before the status', () => {
    expect(list).toMatch(/const inView = bookings\.filter\(\(b\) => matchesStaff\(b\) && matchesQuery\(b\)\);/);
    expect(list).toMatch(/const matching = inView\.filter\(matchesStatus\);/);
    expect(list).toMatch(/const countIn = \(status: string\) => inView\.filter/);
  });

  it('Confirmed counts every confirmed booking, so pressing it delivers the number it shows', () => {
    expect(list).not.toMatch(/within2h|comingUp/);
    expect(list).toMatch(/value=\{countIn\('confirmed'\)\}/);
  });

  it('a pressed tile is drawn pressed, and shows focus', () => {
    expect(css).toMatch(/\.bk-kpi-btn\.is-active\s*\{/);
    expect(css).toMatch(/\.bk-kpi-btn:focus-visible\s*\{/);
  });
});

describe('the "not marked yet" strip is gone', () => {
  it('nothing renders it, and nothing is left of it', () => {
    expect(list).not.toMatch(/needsAnswer|unmarkedOnly|bk-needs-answer|visitNeedsAnswer/);
    expect(css).not.toMatch(/bk-needs-answer/);
  });
});
