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
    expect(list).toMatch(/const matching = inView\.filter\(matchesStatus\)\.filter\(/);
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
    // The prompt strip, its predicate and its copy. (`unmarkedOnly` is back, but only as the
    // narrowing Home's card opens with — see the block below — never as a strip on every visit.)
    expect(list).not.toMatch(/needsAnswer|bk-needs-answer|visitNeedsAnswer/);
    expect(css).not.toMatch(/bk-needs-answer/);
  });
});

describe("Home's 'Not marked done' cards open the set they counted (Jira GRW-310)", () => {
  const read = (rel: string) => readFileSync(path.join(dir, rel), 'utf-8');

  it('both Home cards link with unmarked=1, and Bookings narrows by the same rule Home counts by', () => {
    // Jira GRW-312 — the owner's link also carries the branch picked above the card.
    expect(read('../components/home/OwnerHome.tsx')).toContain('`/appointments?status=confirmed&unmarked=1${branch');
    expect(read('../components/home/OwnerHome.tsx')).toContain('href: unmarkedHref');
    expect(read('../components/home/ReceptionHome.tsx')).toContain("href: '/appointments?status=confirmed&unmarked=1'");
    expect(list).toMatch(/import \{ countsAsNotMarked \} from '\.\.\/lib\/live-state';/);
    expect(list).toMatch(/!unmarkedOnly \|\| countsAsNotMarked\(b, now\)/);
    expect(read('page.tsx')).toMatch(/initialUnmarked=\{params\.unmarked === '1'\}/);
  });

  it('the narrowing is visible and can be cleared', () => {
    expect(list).toMatch(/className="bk-unmarked-chip" role="status"/);
    expect(list).toMatch(/setUnmarkedOnly\(false\)/);
    expect(list).toMatch(/statusFilter !== '' \|\| unmarkedOnly/);
  });

  it('there is no clock of its own left running: `now` comes from the server render', () => {
    expect(list).not.toMatch(/setNow|setInterval/);
    expect(list).toMatch(/const now = useMemo\(\(\) => new Date\(nowISO\), \[nowISO\]\);/);
  });
});

describe('opening a booking from Search', () => {
  it('latches only once the booking is found, and removes ?open= from the address', () => {
    const effect = list.slice(list.indexOf('const openedFromSearch'), list.indexOf('const q = query'));
    expect(effect.indexOf('if (!group) return;')).toBeGreaterThan(-1);
    expect(effect.indexOf('if (!group) return;')).toBeLessThan(effect.indexOf('openedFromSearch.current = true;'));
    expect(effect).toMatch(/url\.searchParams\.delete\('open'\)/);
    expect(effect).toMatch(/window\.history\.replaceState/);
  });
});
