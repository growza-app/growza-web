import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-10 — New booking asks three questions, each once, each on one line.
 *
 * The screen carried eleven controls: a client box, a Booking date, a Booking time, a sideways row of stylists,
 * a service box, a sideways row of kinds, three photo rows, a pager, and a Waiting/Starting pair. It did not fit
 * a 344px phone, and two pairs of them could disagree:
 *
 *   · the Booking time and the free-slot grid both decided when the visit starts, and the grid silently moved
 *     the choice on to "the first free one after it";
 *   · a stylist and a time could both be set and then dropped without a word by Add to waiting queue, which
 *     posts neither.
 *
 * Record payment is the same component and keeps every one of those controls — it rings up what already
 * happened and wants its catalogue in front of it. So each guard below is really two: the New booking page
 * changed, and the till did not.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const code = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));
const css = strip(readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8'));

describe('New booking asks one question per line', () => {
  it('has a flag that means New booking and never Record payment', () => {
    expect(code).toMatch(/const bookForm = pageForm && !forPayment;/);
    // `pageForm` alone is true on Record payment's page too, which is the whole reason this flag exists.
    expect(code).toMatch(/const pageForm = presentation === 'page' && !token;/);
  });

  it('shows rows instead of the open controls, and the rows open a sheet', () => {
    expect(code).toMatch(/\{bookForm \? bookRows : servicesAndStylist\}/);
    expect(code).toMatch(/const \[asking, setAsking\] = useState<'services' \| 'stylist' \| 'when' \| null>\(null\);/);
    expect(code).toMatch(/onClick=\{\(\) => setAsking\(key\)\}/);
    // The sheet renders the SAME controls the page used to show inline — one picker, not a second one written twice.
    expect(code).toMatch(/asking === 'services' \? serviceSearch : asking === 'stylist' \? stylistField : whenChoices/);
  });

  it('asks when exactly once: no Booking time select, no second slot grid', () => {
    expect(code).toMatch(/\{forPayment \|\| bookForm \? null : \(/);
    // The free-slot grid is the one list that knows what is actually free, so it is the one that stays.
    expect(code).toMatch(/\{later && picked\.length > 0 && !bookForm \? \(/);
    expect(code).toMatch(/const whenChoices = \(/);
    expect(code).toMatch(/wi-slot-grid/);
  });

  it('offers Waiting as an answer to when, not a chip beside Starting', () => {
    expect(code).toMatch(/const outcomeChips = pageOutcome && !bookForm \? \(/);
    expect(code).toMatch(/whenChoice\('queue', queueing, nv\.whenWaiting, nv\.whenWaitingUnder\)/);
    expect(code).toMatch(/whenChoice\('now', !queueing && !later, nv\.timeNow\(nowLabel\), nv\.whenNowUnder, noStaffHere \|\| noOneCanDoIt\)/);
    expect(code).toMatch(/whenChoice\('pick', !queueing && later, nv\.whenPick, nv\.whenPickUnder\)/);
  });

  it('hides the stylist row while the answer is Waiting, because a token has no stylist', () => {
    expect(code).toMatch(/\{queueing \? null : bookRow\('stylist', providerNoun, stylistAnswer, rowPhoto\(/);
    // The reason it must be hidden: the token posts the client, the services and the branch, and nothing else.
    const post = code.slice(code.indexOf('await api.addToQueue({'));
    const payload = post.slice(0, post.indexOf('});'));
    expect(payload).not.toMatch(/schedulableId/);
    expect(payload).not.toMatch(/startAt/);
    // And says so where the client is told what happened: a token's confirmation has neither.
    expect(code).toMatch(/confirmFor\(\{ startAt: null, tokenNo: entry\.tokenNo, schedulableId: null \}\)/);
  });

  it('names the time on the button, so the tap confirms what was chosen', () => {
    expect(code).toMatch(/bookForm && slotUtc\s*\n?\s*\? nv\.bookAt\(clockTime\(slotUtc\)\)/);
  });

  it('picks services exactly as Record payment does — the same menu, not a second one', () => {
    // Owner, 2026-10-10 — the till's picker IS the picker: photographs, kinds of service and the pager, moved
    // into the sheet rather than replaced by a plain list. The receptionist who rings a visit up is the one who
    // booked it an hour earlier, and two pickers over one catalogue is the drift GRW-297 already undid once.
    expect(code).toMatch(/\{onPage && categories\.length/);
    expect(code).toMatch(/\{onPage \? \(\s*\n\s*<Pagination/);
    expect(code).toMatch(/<img\s*\n?\s*src=\{servicePhotoUrl\(s\)\}/);
  });

  it('keeps a picture on every row, so the screen can be worked without reading it', () => {
    // The menu moving into a sheet took the photographs off the screen, and they are how a receptionist who is
    // not a confident reader worked it. Each row opens with one: the service, the stylist's face, or an icon.
    expect(code).toMatch(/const rowPhoto = \(src: string \| null, icon: ReactNode\)/);
    expect(code).toMatch(/rowPhoto\(firstPickedPhoto, <IconScissors \/>\)/);
    expect(code).toMatch(/rowPhoto\(null, <IconClock \/>\)/);
    expect(code).toMatch(/rowPhoto\(chosenStylistPhoto, <IconUser \/>\)/);
    // Answered reads as colour, not only as weight: bold alone is invisible to someone scanning, not reading.
    expect(code).toMatch(/className=\{`wi-row-btn \$\{empty \? '' : 'wi-row-done'\}`\}/);
    expect(css).toMatch(/\.wi-row-done \.wi-row-photo \{[^}]*background: var\(--accent-soft\);/);
  });

  it('says it in words a hurried reader gets first time', () => {
    const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8')).newVisit;
    // Owner, 2026-10-10 — the plainer word wins, and changes everywhere at once. "Whoever is free" was the
    // hardest word on the screen, sitting in the one row a desk reads fifty times a day.
    expect(en.whoeverIsFree).toBe('Anyone free');
    expect(en.whenWaitingUnder).toBe('no time given');
    expect(en.whenNowUnder).toBe('goes in now');
    expect(en.whenPickUnder).toBe('today or later');
    expect(en.servicesMissing).toBe('Choose a service first.');
    // Nothing on these rows runs past four words: at 344px a fifth wraps under the tile.
    for (const k of ['whenWaiting', 'whenWaitingUnder', 'whenNowUnder', 'whenPick', 'whenPickUnder', 'rowWhen', 'rowAddService']) {
      expect(String(en[k]).split(' ').length, `${k} is too long to read at a glance`).toBeLessThanOrEqual(4);
    }
  });

  it('styles the rows and the sheet, with one scrolling region in it', () => {
    expect(css).toMatch(/\.wi-rows \{/);
    expect(css).toMatch(/\.wi-row-btn \{/);
    expect(css).toMatch(/\.wi-when-opt \{/);
    const body = css.slice(css.indexOf('.wi-ask-body {'), css.indexOf('.wi-ask-body {') + 220);
    expect(body).toMatch(/overflow-y: auto;/);
    // A row is a tap target before it is a layout: 44px is the app's floor and this clears it.
    const row = css.slice(css.indexOf('.wi-row-btn {'), css.indexOf('.wi-row-btn {') + 400);
    expect(Number(/min-height: (\d+)px;/.exec(row)?.[1])).toBeGreaterThanOrEqual(44);
  });
});
