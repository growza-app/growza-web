import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';

/**
 * Jira GRW-572 — New booking on a wide desk; reshaped by the owner on 2026-10-19 into WHEN first (a card over the
 * screen), then two panels' worth of who and what with a Book bar along the bottom.
 *
 * It is the one-column form with room, not a second booking form: the same hooks, the same `submit` /
 * `queueIt`, the same client block and When state. These pin the seams that make that true, and the width rule
 * that keeps phones and narrow laptops exactly as they were.
 */
const here = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const wrapper = here('./NewBookingClient.tsx');
const sheet = here('../../components/NewVisitSheet.tsx');
const unpaid = here('./DeskUnpaid.tsx');
const css = here('../../styles/79-desk-booking.css');
const globals = here('../../globals.css');

describe('New booking on a wide desk', () => {
  it('is asked for only at the desktop tier, never for Record payment, and waits the same one frame as the till', () => {
    expect(wrapper).toMatch(/desk=\{purpose !== 'payment' && wide && layout === 'desk'\}/);
    // The width is read for every purpose now, in the one effect that paints both answers together.
    expect(wrapper).not.toMatch(/if \(!quick\) return;/);
    expect(wrapper).toMatch(/if \(!quick && purpose !== 'payment' && layout === 'unknown'\) return <div className="walk-in-page" aria-busy="true" \/>;/);
    expect(sheet).toMatch(/const deskForm = bookForm && desk;/);
    expect(css).toMatch(/^@media \(min-width: 1101px\) \{/m);
    expect(css).not.toMatch(/max-width: 860px/);
    expect(globals.indexOf('79-desk-booking.css')).toBeGreaterThan(globals.indexOf('79-desk-till.css'));
  });

  const desk = () => sheet.slice(sheet.indexOf('if (deskForm && onForm) {'), sheet.indexOf('return (\n    <>\n      {/* Jira GRW-478'));

  it('draws the phone form\'s own pieces, and the till\'s grid, with no second save path', () => {
    const d = desk();
    expect(d.length).toBeGreaterThan(0);
    for (const piece of ['{clientCombo}', '{clientFields}', '{stylistField}', '{slotsBlock}', '{goButton}', '{pageHead}']) expect(d).toContain(piece);
    // No third panel: the right-hand column is gone.
    for (const cls of ['pf-wide-grid', 'pf-wide-left', 'pf-wide-right']) expect(d).not.toContain(cls);
    for (const cls of ['wi-desk2-top', 'wi-desk2-bar']) expect(d).toContain(cls);
    // The menu is the till's tiles, driven by the one-column form's own counters.
    expect(d).toMatch(/<DeskServiceGrid\s+services=\{services\}\s+countOf=\{countOnBill\}\s+onMore=\{addOneMore\}\s+onLess=\{removeOneOf\}/);
    expect(d).toMatch(/onPickPackage=\{\(o\) => \(offerId === o\.id \? removeCombo\(\) : applyCombo\(o\)\)\}/);
    // The lines are the till's rows: a package is one row, and taking it off takes the whole package.
    expect(d).toMatch(/onLess=\{\(key\) => \(comboActive && key === offerId \? removeCombo\(\) : removeOneOf\(key\)\)\}/);
    // Nothing in the desk block calls the API itself: the writes stay in `submit` and `queueIt`.
    expect(d).not.toMatch(/api\./);
    // The one column and the desk share ONE button; the tray no longer builds its own.
    expect((sheet.match(/const goButton = \(/g) ?? []).length).toBe(1);
    expect(sheet).toMatch(/\{trayTotal \? <div className="wi-tray-row">\{trayTotal\}\{goButton\}<\/div> : goButton\}/);
  });

  it('asks WHEN first in a card, unless the link already answered it', () => {
    const d = desk();
    expect(d).toContain('<DeskWhenCard');
    expect(d).toContain('{!whenAsked ? (');
    expect(sheet).toContain('const [whenAsked, setWhenAsked] = useState(!askWhenFirst);');
    // Now and Waiting are whole answers (one press, card closes); Pick a time still has a day and a time to give.
    expect(d).toMatch(/pickWhen\(what\);[\s\S]*?if \(what !== 'pick'\) setWhenAsked\(true\);/);
    // A click outside, or Escape, puts the card away with the answer as it stands; it does not leave the booking.
    expect(d).toContain('onClose={() => setWhenAsked(true)}');
    expect(here('./DeskWhenCard.tsx')).toContain('onClick={(e) => e.target === e.currentTarget && onClose()}');
    // The answer stays on screen as a line that reopens the card.
    expect(d).toMatch(/onClick=\{\(\) => setWhenAsked\(false\)\}/);
    // Only `?mode=now` (Walk-in) skips the card; New booking and a bare link ask.
    expect(here('./page.tsx')).toContain("askWhen={params.mode !== 'now'}");
    expect(wrapper).toContain('askWhenFirst={askWhen}');
  });

  it('keeps the stylist beside the answer to when, and leaves it out while the answer is Waiting', () => {
    const d = desk();
    expect(d).toMatch(/\{queueing \? null : <div className="wi-desk-stylist">\{stylistField\}<\/div>\}/);
  });

  it('shows the free times in the bottom bar once there is a service, since they depend on how long it takes', () => {
    const d = desk();
    expect(d).toMatch(/\{later && !queueing && picked\.length > 0 \? <div className="wi-desk2-slots">\{slotsBlock\}<\/div> : null\}/);
  });

  it('no longer lists who is in today on New booking; the till keeps its rows and their tap', () => {
    expect(sheet).not.toContain('<DeskUnpaid');
    expect(unpaid).toMatch(/onClick=\{\(\) => router\.push\(r\.href\)\}/);
  });

  it('has its words in both languages', () => {
    for (const key of ['deskToday', 'deskOnVisit', 'deskEmpty', 'deskNobodyToday', 'deskWhenTitle', 'deskTomorrow', 'deskOtherDay', 'deskContinue', 'deskWhenLabel', 'deskAround']) {
      expect((en.newVisit as Record<string, string>)[key]).toBeTruthy();
      expect((hi.newVisit as Record<string, string>)[key]).toBeTruthy();
    }
  });
});
