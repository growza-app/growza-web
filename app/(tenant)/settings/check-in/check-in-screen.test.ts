import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { isShortMapsLink, mapsHref, pinFromText } from '../../lib/geo-fix';

/**
 * Owner, 2026-10-11, looking at Settings › Phone check-in: "lot of functional, UX/UI issues in it".
 *
 * Six of them, all in one screen, and none of them subtle once measured in the page:
 *
 *   1. the two `<label className="field">` blocks were INLINE, so the label and its box shared a line
 *   2. the maps box was `type="url"`, a type the shared control rule never enumerated — a square grey
 *      browser default beside a select with the app's 14px corners
 *   3. Save never pinned, because `.card { overflow: hidden }` makes the card the sticky bar's scrolling
 *      box; it sat at y 795–867 behind a tab bar starting at 807, and a tap on it went Home
 *   4. the hint said to paste a Maps SHARE link, which is the one thing the parser cannot read
 *   5. `getFix` hands back the phone's own accuracy and the screen threw it away
 *   6. leftover text in the link box refused to save a pin that was already correct
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const here = __dirname;
const form = strip(readFileSync(resolve(here, 'CheckInForm.tsx'), 'utf8'));
const checkInCss = readFileSync(resolve(here, '../../styles/88-check-in.css'), 'utf8');
const controlCss = readFileSync(resolve(here, '../../styles/11-availability.css'), 'utf8');
const cardCss = readFileSync(resolve(here, '../../styles/05-cards.css'), 'utf8');
const bar = strip(readFileSync(resolve(here, '../SettingsSaveBar.tsx'), 'utf8'));

describe('the fields stack, because a label does not', () => {
  it('gives this card the column layout every other `.field` user writes for itself', () => {
    /*
     * `.field` carries no layout of its own — `.bp-form .field`, `.edit-grid .field` and
     * `.filters-inline .field` each state this same column, and the screens that do not are writing
     * `<div>`s, which stack because a div is block. These are `<label>`s. Measured before the fix at
     * 375×812: `display: inline`, the input starting at x=156 on the label's own line, and
     * `margin: 0px` on all three fields.
     */
    const rule = checkInCss.slice(checkInCss.indexOf('.ci-settings .field {'));
    const block = rule.slice(0, rule.indexOf('}'));
    expect(block).toMatch(/display: flex;/);
    expect(block).toMatch(/flex-direction: column;/);
    expect(checkInCss).toMatch(/\.ci-settings \.field \+ \.field,/);
  });

  it('lets the box have the card, not the toolbar floor it inherits', () => {
    // `min-width: 180px` on the shared control is a floor for a filter bar, not a width for a form field.
    expect(checkInCss).toMatch(/\.ci-settings \.field > input,\s*\n\.ci-settings \.field > select \{\s*\n\s*width: 100%;/);
  });

  it('enumerates url in the shared control rule, the one input type it had missed', () => {
    // Measured: border-radius 0, border #767676, padding 1px 2px — a raw browser box beside a styled select.
    const list = controlCss.slice(controlCss.indexOf('\nselect,'), controlCss.indexOf('textarea {'));
    expect(list).toMatch(/input\[type='url'\],/);
  });

  it('gives the two pin buttons one height', () => {
    expect(checkInCss).toMatch(/\.ci-pin-actions \.btn,\s*\n\.ci-pin-actions \.btn-ghost \{\s*\n\s*min-height: 48px;/);
    // The one-off class that gave only the green one its height is gone with it.
    expect(form).not.toMatch(/ci-here/);
    expect(checkInCss).not.toMatch(/\.ci-here/);
  });
});

describe('Save is somewhere a thumb can reach it', () => {
  it('sits outside the card, which clips a sticky box', () => {
    /*
     * `.card { overflow: hidden }` makes the CARD the sticky bar's scrolling box, and a card does not
     * scroll — so `position: sticky` never engaged and Save simply sat at the end of the content. Every
     * other settings form already renders the bar beside its card; this one did not.
     *
     * Counted rather than matched on a shape prettier is free to re-wrap: if the bar were back inside
     * `.card-body`, there would be unclosed `<div`s before it.
     */
    expect(cardCss).toMatch(/overflow: hidden;/);
    const upToBar = form.slice(0, form.indexOf('<SettingsSaveBar'));
    expect(upToBar.match(/<div/g)?.length).toBe(upToBar.match(/<\/div>/g)?.length);
  });

  it('has no "Saved" note to show, and no longer claims one', () => {
    /*
     * GRW-556 made every settings form close on a successful save, so the bar's own note could never
     * appear — the Settings list says "Saved" instead (`SavedToast`). Five forms were each keeping a
     * `saved` boolean and a `savedLabel` string to feed a span nobody can see.
     */
    expect(bar).not.toMatch(/saved|savedLabel|settings-savebar-note/);
    for (const f of ['booking/BookingRulesForm', 'report-access/ReportAccessForm', 'working-hours/WorkingHoursForm', 'notifications/RemindersForm']) {
      const src = strip(readFileSync(resolve(here, `../${f}.tsx`), 'utf8'));
      expect(src, f).not.toMatch(/saved=\{|savedLabel=\{|setSaved\(|setGraceSaved\(/);
    }
  });
});

describe('a pin the owner can set, check and trust', () => {
  it('names a share link for what it is instead of answering "no place in that link"', () => {
    // What a phone's Share button actually produces — and what the old hint told the owner to paste.
    expect(isShortMapsLink('https://maps.app.goo.gl/AbC123xyz')).toBe(true);
    expect(isShortMapsLink('https://goo.gl/maps/AbC123')).toBe(true);
    expect(isShortMapsLink('https://maps.apple.com/p/XYZ')).toBe(true);
    // Not a short link: the desktop address bar, which has always worked and still has to.
    expect(isShortMapsLink('https://www.google.com/maps/@12.9352,77.6245,17z')).toBe(false);
    expect(pinFromText('https://www.google.com/maps/@12.9352,77.6245,17z')).toEqual({ lat: 12.9352, lng: 77.6245 });
    // And the shape the hint now asks for, which is what Maps copies from a long press.
    expect(pinFromText('12.97123, 77.59456')).toEqual({ lat: 12.97123, lng: 77.59456 });
    expect(form).toMatch(/setError\(!found && isShortMapsLink\(text\) \? t\('errors\.shortLink'\) : null\);/);
  });

  it('stops telling the owner to do the thing that cannot work', () => {
    expect(en.settingsCheckIn.linkHint).toMatch(/press and hold/);
    expect(en.settingsCheckIn.linkHint).not.toMatch(/[Ss]hare the branch/);
    expect(en.settingsCheckIn.linkPlaceholder).toBe('12.97123, 77.59456');
    // Every new string has its Hindi, or half the product says one thing and half says another.
    for (const key of ['linkLabel', 'linkHint', 'linkPlaceholder', 'seeOnMap', 'pinRough'] as const) {
      expect(hi.settingsCheckIn[key], key).toBeTruthy();
    }
    expect(hi.settingsCheckIn.errors.shortLink).toBeTruthy();
  });

  it('shows the pin somewhere it can be recognised', () => {
    // Two five-decimal numbers cannot be checked by the person whose shop it is.
    expect(mapsHref({ lat: 12.9352, lng: 77.6245 })).toBe('https://www.google.com/maps/search/?api=1&query=12.9352,77.6245');
    expect(form).toMatch(/<a className="ci-pin-check" href=\{mapsHref\(pin\)\} target="_blank" rel="noopener noreferrer">/);
  });

  it('keeps the accuracy the phone reported, and says when it is wider than the fence', () => {
    /*
     * `getFix` has always returned `accuracyM` and this screen dropped it, so an indoor cell-tower fix
     * good to ±800m was shown as a green "Set"; the fence then sat on a guess and every stylist's "I'm
     * in" landed `pending`/`self_unverified` with nothing anywhere saying why. Measured against the
     * radius the owner picked, so changing "How close counts" re-answers the question.
     */
    expect(form).toMatch(/setPin\(\{ lat: fix\.lat, lng: fix\.lng, accuracyM: fix\.accuracyM \}\);/);
    expect(form).toMatch(/const rough = pin\?\.accuracyM != null && pin\.accuracyM > radius \? Math\.round\(pin\.accuracyM\) : null;/);
    expect(form).toMatch(/\{t\('pinRough', \{ m: rough, radius \}\)\}/);
    expect(en.settingsCheckIn.pinRough).toMatch(/\{m\}/);
    expect(en.settingsCheckIn.pinRough).toMatch(/\{radius\}/);
  });

  it('refuses the link only when there is nothing else to save', () => {
    /*
     * The link box is the ALTERNATIVE to "Use where I am now" — "**Or** paste…" — so leftover text in it
     * used to block a save of a pin that was already right: the owner taps Save, is told about a link
     * they are not relying on, and nothing is written.
     */
    expect(form).toMatch(/if \(!pin && link\.trim\(\)\) \{/);
    expect(form).toMatch(/setError\(isShortMapsLink\(link\) \? t\('errors\.shortLink'\) : t\('errors\.noPlaceInLink'\)\);/);
  });
});
