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
 * token order (which is arrival order), and out of the money figures.
 *
 * Jira GRW-489 — and worked from the row: the board's own give sheet, with Record payment handed up
 * to the till and "They left" where it already was. Not read-only any more; `describe` below.
 */
const here = (p: string) => readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), p), 'utf-8');
const code = (p: string) => here(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const list = code('./BookingsList.tsx');
const page = code('./page.tsx');
const css = here('../styles/32-customers.css');
const give = code('../components/home/GiveToStaffSheet.tsx');

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

  /**
   * Jira GRW-489 — the row works the token, rather than sending the desk to Home for it.
   *
   * It was read-only when this section shipped, and the link to the board read as a dead end: tapping
   * the person standing in front of you landed on another screen where you had to find the same row
   * again. The row opens the desk's OWN sheets — the same components the board opens — so a token has
   * one set of answers and not two.
   */
  describe('working a token from the row', () => {
    it('the row is the control, and the whole of it', () => {
      expect(list).toMatch(/<button\n\s+type="button"\n\s+className="bk-waiting-row"/);
      expect(css).toMatch(/\.bk-waiting-row \{[^}]*width: 100%;/);
      // Still 56px of it: a token is a target, not a line of text.
      expect(css).toMatch(/\.bk-waiting-row \{[^}]*min-height: 56px;/);
    });

    it('opens the board\'s own give sheet, not a second copy of it', () => {
      expect(list).toMatch(/import \{ GiveToStaffSheet \} from '\.\.\/components\/home\/GiveToStaffSheet'/);
      expect(list).toMatch(/<GiveToStaffSheet/);
      // The desk's words, not this screen's: two sets for the same four buttons is how they drift.
      expect(list).toMatch(/t=\{hc\}/);
    });

    it('free/busy is the same fact Home shows — an unpaid visit in the chair', () => {
      const block = list.slice(list.indexOf('const busy ='), list.indexOf('const tabCount'));
      expect(block).toMatch(/liveState\(g, now\) !== 'in_service'/);
      expect(block).toMatch(/minutesBetween\(g\.startAt, now\)/);
    });

    it('record payment is handed up, so one overlay is on screen at a time', () => {
      // The give sheet does not open the till inside itself: it asks its parent to swap them.
      expect(give).toMatch(/onRecordPayment\?: \(\) => void;/);
      expect(give).not.toMatch(/NewVisitSheet|VisitTill/);
      expect(list).toMatch(/setPayingToken\(giving\);/);
      expect(list).toMatch(/<NewVisitSheet mode="now" purpose="payment" token=\{payingToken\}/);
    });

    it('they left is already in that sheet — this adds no second way to drop a token', () => {
      expect(give).toMatch(/t\.theyLeft/);
      expect(give).toMatch(/api\.queueEntryLeft\(entry\.id\)/);
    });

    it('a role that may do neither keeps the link to the board', () => {
      // A button that can only answer 403 is worse than a trip to Home.
      expect(list).toMatch(/\{mayGive \|\| mayRecordPayment \? \(/);
      expect(list).toMatch(/useMayUse\('queue\.give'\)/);
      expect(list).toMatch(/useMayUse\('visit\.recordPayment'\)/);
      expect(list).toMatch(/href=\{branch \? `\/\?location=\$\{encodeURIComponent\(branch\.id\)\}#hm-queue` : '\/#hm-queue'\}/);
    });

    it('a desk that may only take money skips the stylist list', () => {
      expect(list).toMatch(/onClick=\{\(\) => \(mayGive \? setGiving\(w\) : setPayingToken\(w\)\)\}/);
    });
  });

  it('counts with the work left, never with the day\'s takings', () => {
    // `To do` is what is left to do, and somebody standing in the salon is left to do (GRW-488).
    // `Completed` and `All`-as-bookings are appointments, so nothing waiting may reach a money figure.
    expect(list).toMatch(/countIn\('confirmed'\) \+ \(waiting\?\.length \?\? 0\)/);
    const earnings = list.slice(list.indexOf('const bookings ='), list.indexOf('const waiting ='));
    expect(earnings).not.toMatch(/waiting/);
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
