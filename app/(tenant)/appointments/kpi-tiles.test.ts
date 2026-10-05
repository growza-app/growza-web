import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-308 — the status filter on Bookings, now a segmented control.
 *
 * GRW-308 made the four KPI tiles the filter: press Confirmed and the list is the confirmed
 * bookings. That solved the duplicate strip above them, and bought a new problem — a tile looks
 * like a figure, so nothing said it was also a control, or which one was pressed.
 *
 * It is three segments now (owner, 2026-10-04): All · To do · Completed, each with its count.
 * `segmented-controls.md > Best practices` is explicit that the reason to reach for one is "to
 * clearly show their selection state", which is exactly what the tiles could not do.
 *
 * Waiting had a segment of its own for an afternoon. The owner's call is that waiting and booked
 * are one answer to the question a receptionist asks — what is left — so they share `To do`, and
 * the distinction between them (in the salon, versus expected) is kept by the amber block at the
 * top of it rather than by a tab.
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const list = readFileSync(path.join(dir, 'BookingsList.tsx'), 'utf-8');
const css = readFileSync(path.join(dir, '../styles/32-customers.css'), 'utf-8');

describe('the segments filter the list', () => {
  it('names the three lists the day can be read as', () => {
    expect(list).toMatch(/const TABS = \['all', 'todo', 'completed'\] as const;/);
  });

  it('To do and Completed partition the day', () => {
    // Nobody has been served yet in one; everybody has in the other. All is both, in time order.
    expect(list).toMatch(/seg === 'todo' \? 'confirmed' : seg === 'completed' \? 'completed' : ''/);
  });

  it('To do counts both halves of what is left — the waiting and the not-yet-done', () => {
    expect(list).toMatch(/seg === 'todo'\s*\?\s*countIn\('confirmed'\) \+ \(waiting\?\.length \?\? 0\)/);
  });

  it('carries its count, so the row says how the day divides before you press anything', () => {
    expect(list).toMatch(/<span className="page-tab-count">\{tabCount\(seg\)\}<\/span>/);
    // "All" is the whole day — the visits in view AND the people waiting, who are part of today.
    expect(list).toMatch(/: inView\.length \+ \(waiting\?\.length \?\? 0\)/);
  });

  it('says which one is chosen, to the eye and to a screen reader', () => {
    expect(list).toMatch(/role="tab"/);
    expect(list).toMatch(/aria-selected=\{tab === seg\}/);
    expect(list).toMatch(/className=\{`page-tab \$\{tab === seg \? 'active' : ''\}`\}/);
  });

  it('the chosen segment is DERIVED from the status filter, not a second state beside it', () => {
    // They were separate for an afternoon and disagreed at once: picking "Didn't come" from the
    // funnel filtered the list while a segment stayed lit, so the row claimed one thing and the
    // list showed another.
    expect(list).toMatch(/const tab: \(typeof TABS\)\[number\] \| null =/);
    expect(list).not.toMatch(/setView2|view2/);
  });

  it('an exception status lights no segment, and the funnel counts it instead', () => {
    // "Didn't come" and "Cancelled" have no segment — honestly, since no segment is showing them.
    expect(list).toMatch(/statusFilter === 'completed' \? 'completed' : null;/);
    expect(list).toMatch(/statusFilter !== '' && statusFilter !== 'confirmed' && statusFilter !== 'completed' \? 1 : 0/);
  });

  it('the funnel keeps only the exceptions — the segments own confirmed and completed', () => {
    const status = list.slice(list.indexOf('id="bk-status"'), list.indexOf('bk-field-sort'));
    expect(status).toMatch(/<option value="no_show">/);
    expect(status).toMatch(/<option value="cancelled">/);
    expect(status).not.toMatch(/<option value="confirmed">/);
    expect(status).not.toMatch(/<option value="completed">/);
  });

  it('the segment row sticks, so a long day can be re-cut without scrolling back', () => {
    // Measured at 390px over a 5-day range: scrolled 700px inside `.page-body`, the row held.
    expect(css).toMatch(/\.bk-tabs \{[^}]*position: sticky;/);
    expect(css).toMatch(/\.bk-tabs \{[^}]*top: 0;/);
  });

  it('the counts do not move when a segment is chosen — they count what is in view before the status', () => {
    expect(list).toMatch(/const inView = bookings\.filter\(\(b\) => matchesStaff\(b\) && matchesQuery\(b\)\);/);
    expect(list).toMatch(/const matching = inView\.filter\(matchesStatus\)\.filter\(/);
    expect(list).toMatch(/const countIn = \(status: string\) => inView\.filter/);
  });

  it('Confirmed counts every confirmed booking, so pressing it delivers the number it shows', () => {
    expect(list).not.toMatch(/within2h|comingUp/);
    expect(list).toMatch(/countIn\('confirmed'\)/);
  });

  it('the funnel stops counting a status a segment already says', () => {
    // Otherwise Completed is reported twice: once by the chosen segment, once by a badge reading 1.
    const block = list.slice(list.indexOf('const filterCount ='), list.indexOf('const tab:'));
    expect(block).not.toMatch(/\(statusFilter \? 1 : 0\)/);
    expect(block).toMatch(/statusFilter !== 'confirmed' && statusFilter !== 'completed'/);
  });

  it('the people waiting ride with what is left, and leave on Completed', () => {
    // They are part of "what is still to do"; they are not part of what has been finished.
    expect(list).toMatch(/waiting\.length > 0 && \(tab === 'all' \|\| tab === 'todo'\)/);
  });

  it('is the app\'s own tab component, not a second one', () => {
    // Services uses `.page-tabs` for All / Hair / Retired. CLAUDE.md: no custom component where one exists.
    expect(list).toMatch(/className="page-tabs bk-tabs"/);
    expect(css).toMatch(/\.bk-tabs \.page-tab \{[^}]*min-height: 44px;/);
  });

  it('nothing is left of the KPI tiles', () => {
    expect(list).not.toMatch(/bk-kpis|bk-kpi-btn|statusTile/);
    expect(list).not.toMatch(/bk-status-on/);
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
    expect(list).toMatch(/import \{ countsAsNotMarked, [^}]*\} from '\.\.\/lib\/live-state';/);
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
