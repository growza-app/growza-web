import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-487 — somebody waiting is not invisible on the day's screen.
 *
 * A queued walk-in is a `QueueEntry`: a token number, an arrival time, the services wanted, and no
 * start time, because nobody has promised them one. Bookings read only `api.appointments(...)`, so
 * a receptionist who added a walk-in and then opened the screen headed "Today's schedule" could not
 * see the person they had just added — the queue reached only Home.
 *
 * They cannot simply join the list: it is ordered by start time, and giving them a made-up one to
 * sit in it would be a lie about when they are being seen. So: their own section above it, in
 * token order (which is arrival order), out of the counts, and read-only — a token is worked at the
 * board on Home.
 */
const here = (p: string) => readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), p), 'utf-8');
const code = (p: string) => here(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const list = code('./BookingsList.tsx');
const page = code('./page.tsx');
const css = here('../styles/32-customers.css');

describe('the people waiting, on Bookings', () => {
  it('the page reads the queue, and only for today', () => {
    // A queue is a fact about now: asking for it while looking at last Tuesday would draw people
    // who are not there. Any other day hands down `[]`, so the section simply does not apply.
    expect(page).toMatch(/isTodayRequest \? api\.walkInQueue\(\)\.catch\(\(\) => null\) : Promise\.resolve\(\[\]\)/);
    expect(page).toMatch(/queue=\{queue\}/);
  });

  it('a failed read says so, and never reads as "nobody is waiting"', () => {
    // BR-12, the rule `Right now` already follows: `null` on failure, never `[]`.
    expect(page).toMatch(/\.catch\(\(\) => null\)/);
    expect(list).toMatch(/\{isToday && waiting === null && \(/);
    expect(list).toMatch(/t\('queueUnreadable'\)/);
  });

  it('draws nothing when nobody is waiting', () => {
    expect(list).toMatch(/\{isToday && waiting !== null && waiting\.length > 0 &&/);
  });

  it('shows the token, the name, the services and how long they have waited', () => {
    // "#2", not "2" — a bare number beside a name reads as a count of something.
    expect(list).toMatch(/\{w\.tokenNo === null \? '—' : `#\$\{w\.tokenNo\}`\}/);
    expect(list).toMatch(/className="bk-waiting-name">\{w\.customerName\}/);
    expect(list).toMatch(/w\.serviceNames\.join\(' · '\)/);
    expect(list).toMatch(/t\('waitingMin', \{ count: wholeMinutes\(w\.addedAt, now\) \}\)/);
  });

  it('is sorted by token number — that is the number the receptionist calls', () => {
    // Arrival order and token order are the same until they are not: a token given to a stylist
    // leaves the queue, and one added at another branch can land between two of these.
    const block = list.slice(list.indexOf('const waiting ='), list.indexOf('const tabCount'));
    expect(block).toMatch(/atBranch\(queue, branch\?\.id \?\? null\)/);
    expect(block).toMatch(/\.sort\(\(a, b\) => \(a\.tokenNo \?\? Number\.MAX_SAFE_INTEGER\) - \(b\.tokenNo \?\? Number\.MAX_SAFE_INTEGER\)\)/);
    // Sorted on a copy: the prop is the server's array and resorting it in place is a side effect.
    expect(block).toMatch(/\.slice\(\)/);
  });

  it('a token without a number sinks, rather than sorting as nought', () => {
    const block = list.slice(list.indexOf('const waiting ='), list.indexOf('const tabCount'));
    expect(block).toMatch(/Number\.MAX_SAFE_INTEGER/);
  });

  it('follows the branch in view, like everything else on this screen', () => {
    // The whole business's queue is read on the server and narrowed here: the branch switch rewrites
    // the URL without reloading, so a server-filtered queue would go stale the moment it changed.
    expect(list).toMatch(/atBranch\(queue, branch\?\.id \?\? null\)/);
    expect(list).toMatch(/href=\{branch \? `\/\?location=\$\{encodeURIComponent\(branch\.id\)\}#hm-queue` : '\/#hm-queue'\}/);
  });

  it('is read-only: a row opens the board, it does not work the token here', () => {
    const section = list.slice(list.indexOf('bk-waiting-list'), list.indexOf('bk-sched-head'));
    expect(section).not.toMatch(/onClick|<button/);
  });

  it('stays out of the tiles — a waiting person is not a booking', () => {
    // The counts come from `bookings`/`inView`, which are appointments. Nothing reads `waiting`.
    const tiles = list.slice(list.indexOf('<div className="bk-kpis">'), list.indexOf('bk-findrow'));
    expect(tiles).not.toMatch(/waiting/);
    expect(list).not.toMatch(/countIn\([^)]*\) \+ waiting/);
  });

  it('reads as the part of the day standing in the salon, not written in the book', () => {
    // Amber, where the schedule is green — and a 56px row, so a token is a comfortable target.
    expect(css).toMatch(/\.bk-waiting \{[^}]*background: #fffaf2;/);
    expect(css).toMatch(/\.bk-waiting-row \{[^}]*min-height: 56px;/);
  });

  it('has its words in both languages', () => {
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(here(`../../../messages/${lang}.json`)) as { bookings: Record<string, string> };
      expect(m.bookings.waitingTitle).toBeTruthy();
      expect(m.bookings.waitingMin).toContain('plural');
      expect(m.bookings.queueUnreadable).toBeTruthy();
    }
  });
});
