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
    // One question opens a sheet. The stylist is a dropdown in its row, and when is three boxes — see below.
    expect(code).toMatch(/const \[asking, setAsking\] = useState<'services' \| null>\(null\);/);
    expect(code).toMatch(/onClick=\{\(\) => setAsking\(key\)\}/);
    expect(code).toMatch(/if \(asking === 'services' && services\) \{/);
  });

  it('asks when exactly once: no Booking time select, no second slot grid', () => {
    expect(code).toMatch(/\{forPayment \|\| bookForm \? null : \(/);
    // The free-slot grid is the one list that knows what is actually free, so it is the one that stays.
    expect(code).toMatch(/\{later && picked\.length > 0 && !bookForm \? \(/);
    expect(code).toMatch(/const whenChoices = \(/);
    expect(code).toMatch(/wi-slot-grid/);
  });

  it('puts the queue on the screen, not two taps inside a row', () => {
    /*
     * Owner, 2026-10-10 — when WAS a row, and hiding the queue behind it was the mistake: adding somebody to
     * the waiting list is the commonest thing a busy desk does. Three boxes, visible, directly above the
     * button they name. The till keeps its own two-chip version, which is why `outcomeChips` is still gated.
     */
    expect(code).toMatch(/const outcomeChips = pageOutcome && !bookForm \? \(/);
    expect(code).toMatch(/whenChoice\('queue', queueing, nv\.whenWaiting\)/);
    expect(code).toMatch(/whenChoice\('now', !queueing && !later, nv\.whenNow, noStaffHere \|\| noOneCanDoIt\)/);
    expect(code).toMatch(/whenChoice\('pick', !queueing && later, nv\.whenPick\)/);
    // Rendered in the form, after the stylist — not behind anything.
    expect(code).toMatch(/\{queueing \? null : stylistRow\}[\s\S]{0,600}\{whenChoices\}/);
    expect(css).toMatch(/\.wi-when-list \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  });

  it('hides the stylist row while the answer is Waiting, because a token has no stylist', () => {
    expect(code).toMatch(/\{queueing \? null : stylistRow\}/);
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

  it("picks services with Record payment's own search, not a second one", () => {
    /*
     * Owner, 2026-10-10 — the search the till's SIMPLE flow opens, `ServiceSheet`: one box, the kinds beside
     * it, one list of rows with a count on each. Not the full form's paged photo menu, and not a third list
     * written here. The receptionist who rings a visit up is the one who booked it an hour earlier.
     */
    expect(code).toMatch(/import \{ ServiceSheet \} from '\.\/ServiceSheet';/);
    expect(code).toMatch(/if \(asking === 'services' && services\) \{/);
    expect(code).toMatch(/counts=\{new Map\(services\.map\(\(x\) => \[x\.id, countOnBill\(x\.id\)\]\)\)\}/);
    // `addOneMore`, not `addService`: picking does not close here, so the next tap is the next service.
    expect(code).toMatch(/onPick=\{addOneMore\}/);
    // And nothing is lost by sharing it — New booking sells combos, so they ride along as one more chip.
    expect(code).toMatch(/packages=\{combos\}/);
    expect(code).toMatch(/onPickPackage=\{\(o\) => \(offerId === o\.id \? removeCombo\(\) : applyCombo\(o\)\)\}/);
  });

  it('leaves Record payment with the search it already had', () => {
    const till = readFileSync(resolve(__dirname, 'ServiceSheet.tsx'), 'utf8');
    // Every New booking addition is optional, so the till's call site renders exactly what it rendered before.
    expect(till).toMatch(/packages\?: Offer\[\];/);
    expect(till).toMatch(/packageOnBillId\?: string \| null;/);
    expect(till).toMatch(/const offers = packages \?\? \[\];/);
    const pay = readFileSync(resolve(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');
    expect(pay).toMatch(/import \{ ServiceSheet \} from '\.\.\/\.\.\/components\/ServiceSheet';/);
    expect(pay).not.toMatch(/packages=\{/);
  });

  it('keeps a picture on every row, so the screen can be worked without reading it', () => {
    // The menu moving into a sheet took the photographs off the screen, and they are how a receptionist who is
    // not a confident reader worked it. Each row opens with one: the service, the stylist's face, or an icon.
    expect(code).toMatch(/const rowPhoto = \(src: string \| null, icon: ReactNode\)/);
    expect(code).toMatch(/rowPhoto\(firstPickedPhoto, <IconScissors \/>\)/);
    expect(code).toMatch(/rowPhoto\(chosenStylistPhoto, <IconUser \/>\)/);
    // The stylist is a dropdown, not a sheet: three or four names do not need a screen (GRW-524 settled this
    // for the till). A real select lies over the row at opacity 0, so the phone's own wheel opens.
    expect(code).toMatch(/const stylistRow = \(/);
    expect(code).toMatch(/className=\{`wi-row-btn wi-row-select/);
    expect(css).toMatch(/\.wi-row-select select \{[^}]*opacity: 0;/);
    // One control to a screen reader: what is drawn is hidden from it, and the select carries the label.
    expect(code).toMatch(/<span className="wi-row-text" aria-hidden="true">/);
    expect(code).toMatch(/aria-label=\{nv\.withWhom\(providerNoun\.toLowerCase\(\)\)\}/);
    // Answered reads as colour, not only as weight: bold alone is invisible to someone scanning, not reading.
    expect(code).toMatch(/className=\{`wi-row-btn \$\{empty \? '' : 'wi-row-done'\}`\}/);
    expect(css).toMatch(/\.wi-row-done \.wi-row-photo \{[^}]*background: var\(--accent-soft\);/);
  });

  it('says it in words a hurried reader gets first time', () => {
    const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8')).newVisit;
    // Owner, 2026-10-10 — the plainer word wins, and changes everywhere at once. "Whoever is free" was the
    // hardest word on the screen, sitting in the one row a desk reads fifty times a day.
    expect(en.whoeverIsFree).toBe('Anyone free');
    expect(en.servicesMissing).toBe('Choose a service first.');
    // No clock on the box: "Starts now" is the whole fact, and "Now · 9:14 PM" said it twice.
    expect(en.whenNow).toBe('Starts now');
    expect(en.whenNow).not.toMatch(/\{time\}/);
    // Nothing on these rows runs past four words: at 344px a fifth wraps under the tile.
    for (const k of ['whenWaiting', 'whenNow', 'whenPick', 'rowAddService']) {
      expect(String(en[k]).split(' ').length, `${k} is too long to read at a glance`).toBeLessThanOrEqual(4);
    }
  });

  it('styles the rows, and every target clears the 44px floor', () => {
    expect(css).toMatch(/\.wi-rows \{/);
    expect(css).toMatch(/\.wi-row-btn \{/);
    expect(css).toMatch(/\.wi-when-opt \{/);
    const opt = css.slice(css.indexOf('.wi-when-opt {'), css.indexOf('.wi-when-opt {') + 400);
    expect(Number(/min-height: ([\d.]+)rem;/.exec(opt)?.[1]) * 16).toBeGreaterThanOrEqual(44);
    // A row is a tap target before it is a layout: 44px is the app's floor and this clears it.
    const row = css.slice(css.indexOf('.wi-row-btn {'), css.indexOf('.wi-row-btn {') + 400);
    expect(Number(/min-height: (\d+)px;/.exec(row)?.[1])).toBeGreaterThanOrEqual(44);
  });
});
