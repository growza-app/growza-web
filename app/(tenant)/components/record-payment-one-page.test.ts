import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import enMessages from '../../../messages/en.json';
import hiMessages from '../../../messages/hi.json';

const here = dirname(fileURLToPath(import.meta.url));
const sheet = readFileSync(resolve(here, 'NewVisitSheet.tsx'), 'utf8');
const css = readFileSync(resolve(here, '../styles/72-walk-in-sheet.css'), 'utf8');

/*
 * Record payment came to 858px against a 667px viewport, so Mark done was always below the fold. Three blocks paid
 * for it: a "Which branch?" row, a Booking date and Booking time pair that were `disabled` on this screen because a
 * payment is always recorded as today/now, and a Name and Phone number pair sitting open under a search box that
 * already fills the name in. The branch and the moment moved into the header; the two fields became a disclosure.
 */
describe('Record payment fits one phone screen', () => {
  it('never asks for a date or a time — the header says when instead', () => {
    // The whole `wi-when` row is skipped, rather than rendered with both controls disabled.
    expect(sheet).toMatch(/Record payment never asks[\s\S]{0,120}\{forPayment \? null : \(/);
    expect(sheet).toMatch(/<span className="wi-head-now">\{nowLabel\}<\/span>/);
    // And the clock is kept true: `nowLabel` is only as fresh as the last render, and a till may sit idle for minutes.
    expect(sheet).toMatch(/setInterval\(\(\) => setMinute\(\(n\) => n \+ 1\), 30_000\)/);
    // The dead `disabled={forPayment}` on the two controls went with the block that held them.
    expect(sheet).not.toMatch(/id="wi-date"[\s\S]{0,200}disabled=\{forPayment\}/);
    expect(sheet).not.toMatch(/id="wi-time"[\s\S]{0,200}disabled=\{forPayment\}/);
  });

  it('keeps the branch a real select, in the header', () => {
    expect(sheet).toMatch(/<span className="wi-head-branch">[\s\S]{0,1200}<select/);
    expect(sheet).toMatch(/aria-label=\{nv\.whichBranch\}/);
    // Its own header row: the middle cell of `1fr auto 1fr` cut the branch name short.
    expect(css).toMatch(/\.wi-head-when \{[^}]*grid-column: 1 \/ -1;/);
    // A 44px target on top of a 36px capsule: the invisible select is what is touched.
    expect(css).toMatch(/\.wi-head-branch select \{[^}]*height: 2\.75rem;/);
    expect(css).toMatch(/\.wi-head-branch select \{[^}]*opacity: 0;/);
  });

  it('closes the name and number fields on both pages, and opens them the moment nobody matches', () => {
    // Owner, 2026-10-07 — the same question in the same place on New booking, which opened on two empty fields.
    expect(sheet).toMatch(/const newPersonClosed =\s*\n?\s*pageForm && !addingNew && !nobodyMatched/);
    // The branch is in the header on BOTH pages now; the body field it used to have is gone.
    expect(sheet).not.toMatch(/pageBranchField/);
    expect(sheet).toMatch(/const pageHead =\s*\n?\s*pageForm && \(forPayment \|\| branches\.length > 1\)/);
    // Only Record payment puts a clock up there: New booking has a Booking date and time of its own to set.
    expect(sheet).toMatch(/\{forPayment \? <span className="wi-head-now">\{nowLabel\}<\/span> : null\}/);
  });

  it('opens them whenever they have something to say', () => {
    // "Nobody on file matches that" sits over the button that would open them — a closed block there is a dead end.
    expect(sheet).toMatch(/const nobodyMatched =[\s\S]{0,220}results\.length === 0 && elsewhere\.length === 0/);
    expect(sheet).toMatch(/!addingNew && !nobodyMatched && !newPhone\.trim\(\) && !nameError && phoneError === null/);
  });

  it('lays the menu out as one list of rows that toggle, with a counter once a row is on the bill', () => {
    expect(sheet).toMatch(/aria-pressed=\{count > 0\}/);
    expect(sheet).toMatch(/onClick=\{\(\) => \(count > 0 \? removeAllOf\(s\.id\) : addOneMore\(s\)\)\}/);
    // One column: three photo cards were ~100px wide at 344px and cut "Anti-Ageing Facial" to "Anti-Ageing F…".
    expect(css).toMatch(/\.wi-card-main \{[^}]*grid-template-columns: 2\.75rem minmax\(0, 1fr\) 1\.5rem;/);
    expect(css).toMatch(/\.wi-card-main \{[^}]*min-height: 3\.5rem;/);
    expect(css).not.toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
    // A SHEET alone keeps hiding the untyped list; both pages list the menu (owner, 2026-10-07 — align the two).
    expect(sheet).toMatch(/!onPage && services !== null && services\.length > 0/);
  });

  it('takes the same service more than once — a parent and two children', () => {
    // − n + replaces the ring; each is a 44px target and a named button, and the number is announced.
    expect(sheet).toMatch(/<span className="wi-qty" role="group" aria-label=\{nv\.qtyOnBill\(s\.name, count\)\}>/);
    expect(sheet).toMatch(/aria-label=\{nv\.oneLess\(s\.name\)\}\s*onClick=\{\(\) => removeOneOf\(s\.id\)\}/);
    expect(sheet).toMatch(/aria-label=\{nv\.oneMore\(s\.name\)\}\s*onClick=\{\(\) => addOneMore\(s\)\}/);
    expect(sheet).toMatch(/<span className="wi-qty-n" aria-live="polite">/);
    expect(css).toMatch(/\.wi-qty-btn \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
    // Each one is its own line on the bill (one leg each, as the API takes), numbered so each amount can differ.
    expect(sheet).toMatch(/\{numberedName\(picked, i\)\}/);
    // The API takes 1–12 lines; + stops there rather than letting Mark done fail.
    expect(sheet).toMatch(/const BILL_MAX_LINES = 12;/);
    expect(sheet).toMatch(/disabled=\{busy \|\| linesLocked \|\| full\}/);
  });

  it('lists the whole menu and narrows it by kind of service', () => {
    // Without a term the till shows every service (New booking shows the first six): 46 of 52 were unreachable.
    expect(sheet).toMatch(/const pool = typed \? filteredServices : \(services \?\? \[\]\);/);
    expect(sheet).toMatch(/serviceCategory \? pool\.filter\(\(s\) => s\.categoryName === serviceCategory\) : pool/);
    expect(sheet).toMatch(/onPage && categories\.length \+ \(combos\.length > 0 \? 1 : 0\) > 1/);
    expect(css).toMatch(/\.wi-category-chips \.wi-chip \{[^}]*min-height: 2\.75rem;/);
  });

  it('drops the two headings a page does not need, and keeps the controls named', () => {
    expect(sheet).toMatch(/\{onPage \? null : \(\s*\n\s*<h2 className="wi-section-label" id="wi-stylist-label">/);
    expect(sheet).toMatch(/aria-label=\{onPage \? nv\.withWhom\(providerNoun\.toLowerCase\(\)\) : undefined\}/);
    // With no heading, the two options that are not a person's name carry the noun themselves.
    expect(sheet).toMatch(/onPage \? `\$\{providerNoun\} · ` : ''/);
  });

  it('calls it the bill, and says the total need not match the prices', () => {
    expect(sheet).toMatch(/<div className="wi-bill-head" id="wi-bill">/);
    expect(sheet).toMatch(/nv\.inThisBill\(picked\.length \+ extras\.length\)/);
    expect(sheet).toMatch(/nv\.totalCanDiffer\(/);
  });

  it('keeps How did they pay and Mark done on the screen', () => {
    // This reverses the 2026-10-06 rule that let the tray scroll away: nothing above it is a long scroll now.
    expect(css).not.toMatch(/\.walk-in-page \.wi-pay-actions \{[^}]*position: static/);
    expect(css).toMatch(/\.walk-in-page \.wi-actions \{[\s\S]*?position: sticky/);
  });

  it('lets Mark done be pressed with something missing, then says what and scrolls to it', () => {
    // Disabled said nothing: the till is never greyed out for a missing field.
    expect(sheet).toMatch(/disabled=\{queueing \? busy : busy \|\| \(forPayment \? false : picked\.length === 0 \|\| cannot\)\}/);
    expect(sheet).toMatch(/thenVisit\(forPayment \? checkBeforeMarkDone\(\) : pageClient\(\), queueing \? queueIt : submit\)/);
    expect(sheet).toMatch(/const bringIntoView = [\s\S]*?scrollIntoView\(\{ block: 'center'/);
    expect(sheet).toMatch(/const checkBeforeMarkDone = [\s\S]*?bringIntoView\(/);
    // Top of the page first: the person, then the services, then an amount that is not a number.
    expect(sheet).toMatch(/!client\s*\?[\s\S]{0,120}'wi-name'[\s\S]*?noServices\s*\?[\s\S]{0,60}'wi-services'[\s\S]*?wi-amount input\[aria-invalid="true"\]/);
    // The error under the services goes the moment one is added.
    expect(sheet).toMatch(/const showServicesError = servicesError && picked\.length === 0;/);
  });

  it('stars what cannot be left empty', () => {
    expect(sheet).toMatch(/\{nv\.nameRequired\}\s*\n\s*<span className="field-required" aria-hidden="true"> \*<\/span>/);
    expect(sheet).toMatch(/onPage && picked\.length === 0 && extras\.length === 0 \? ' \*' : ''/);
    expect(css).toMatch(/\.field-required \{[^}]*var\(--amber\)/);
  });

  it('pages the menu three rows at a time instead of scrolling it', () => {
    expect(sheet).toMatch(/const SERVICES_PER_PAGE = 3;/);
    expect(sheet).toMatch(/shownServices\.slice\(\(serviceAt - 1\) \* SERVICES_PER_PAGE, serviceAt \* SERVICES_PER_PAGE\)/);
    expect(sheet).toMatch(/\{pagedServices\.map\(\(s\) => \{/);
    // The one shared control, not a second pager; and narrowing starts again at page one.
    expect(sheet).toMatch(/<Pagination\s+page=\{serviceAt\}/);
    expect(sheet).toMatch(/useEffect\(\(\) => setServicePage\(1\), \[serviceCategory, serviceTerm\]\)/);
  });

  it('draws the four ways of paying as equal tiles, the icon above the word', () => {
    expect(sheet).toMatch(/className=\{`wi-chip wi-pay-tile \$\{paymentMode === m\.value \? 'wi-chip-on' : ''\}`\}/);
    expect(sheet).toMatch(/<span className=\{`wi-pay-icon wi-pay-icon-\$\{m\.value\}`\} aria-hidden="true">\{PAY_ICONS\[m\.value\]\}<\/span>/);
    // Each mode has its own colour from the existing palette; the chosen tile turns it white with the text.
    expect(css).toMatch(/\.wi-pay-icon-card \{\s*color: var\(--blue\);/);
    expect(css).toMatch(/\.wi-pay-tile\.wi-chip-on \.wi-pay-icon-cash,/);
    for (const mode of ['cash', 'card', 'upi', 'other']) expect(sheet).toMatch(new RegExp(`${mode}: <IconPay`));
    expect(css).toMatch(/\.wi-pay-modes \.wi-pay-tile \{[^}]*flex: 1 1 0;[^}]*flex-direction: column;[^}]*min-height: 2\.875rem;/);
    // The 12px floor: the mock's 11px label is not followed.
    expect(css).toMatch(/\.wi-pay-modes \.wi-pay-tile \{[^}]*font-size: 0\.75rem;/);
  });

  it('shows the total being charged beside Mark done, and takes you to the lines from it', () => {
    // The bill's lines sit under the menu, below the pinned tray: without this the amount was off screen.
    expect(sheet).toMatch(/const billTotalMinor = comboActive \? comboWithExtrasTotalMinor : paidTotalMinor;/);
    expect(sheet).toMatch(/if \(!queueOffered && trayTotal\)/);
    expect(sheet).toMatch(/getElementById\('wi-bill'\)\?\.scrollIntoView/);
    expect(css).toMatch(/\.wi-tray-total \{[^}]*min-height: 44px;/);
  });

  it('lets a returning client with no number give one, saved with the visit', () => {
    // Only for someone on file with no number: changing a number they have stays on the client profile.
    expect(sheet).toMatch(/selected\.kind === 'existing' && !selected\.phone \? \(/);
    expect(sheet).toMatch(/<PhoneField\s+id="wi-picked-phone"/);
    // Saved BEFORE the visit, through the same PATCH the profile uses, and a refusal stops the visit.
    expect(sheet).toMatch(/api\.updateCustomer\(client\.id, \{ phone: toStoredPhone\(pickedPhone\) \?\? null \}\)/);
    expect(sheet).toMatch(/const ready = await withPickedPhone\(client\);\s*if \(ready\) await visit\(ready\);/);
    // A half-typed number gets the same check as a new client's.
    expect(sheet).toMatch(/const problem = checkPhone\(pickedPhone, \{ required: false \}\);/);
    // Every way forward goes through it: Mark done, Start, Book it, and Add to queue.
    expect(sheet).toMatch(/void thenVisit\(forPayment \? checkBeforeMarkDone\(\) : pageClient\(\), queueing \? queueIt : submit\)/);
    expect(sheet).toMatch(/queueing \? queueIt : submit/);
  });

  it('lists the Packages tab under its own chip, and calls them packages, never combos', () => {
    // A chip of its own, only when the business has packages; each one a row that toggles at its one price.
    expect(sheet).toMatch(/\.\.\.\(combos\.length > 0 \? \[PACKAGES_CHIP\] : \[\]\)/);
    expect(sheet).toMatch(/onClick=\{\(\) => \(on \? removeCombo\(\) : applyCombo\(o\)\)\}/);
    // Neither page ALSO shows the sheet's row of package chips under the list: the Packages chip is the way in.
    expect(sheet).toMatch(/\{!onPage && combos\.length > 0 && serviceTerm\.trim\(\) === '' && \(/);
    // Owner, 2026-10-07: the word is "package", in both languages, everywhere.
    const words = (o: unknown): string[] =>
      typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(words) : [];
    // `{combo}` is a placeholder the business's own noun fills, not a word anyone reads.
    for (const w of words(enMessages)) expect(w.replace(/\{[^}]*\}/g, ''), w).not.toMatch(/\bcombos?\b/i);
    for (const w of words(hiMessages)) expect(w, w).not.toMatch(/कॉम्बो/);
  });

  it('opens what a package holds from its own "View details", without taking a tap off the row', () => {
    expect(sheet).toMatch(/className="wi-pkg-details"\s+aria-label=\{nv\.viewDetailsOf\(o\.title\)\}\s+aria-haspopup="dialog"/);
    expect(sheet).toMatch(/<PackageDetails[\s\S]{0,400}onToggle=\{\(\) => \(offerId === o\.id \? removeCombo\(\) : applyCombo\(o\)\)\}/);
    const details = readFileSync(resolve(here, 'PackageDetails.tsx'), 'utf8');
    // A real dialog: named by its title, Escape and the focus trap from the shared hook.
    expect(details).toMatch(/role="dialog"\s+aria-modal="true"\s+aria-labelledby="pkg-details-title"/);
    expect(details).toMatch(/useDialog\(dialogRef, \{ onClose \}\)/);
    // Each service at its own price, what they come to, the package price and the saving.
    expect(details).toMatch(/const saving = priceMinor \? Math\.max\(0, separately - Number\(priceMinor\)\) : 0;/);
    // A 44px target that does not make the row taller: its hit area reaches 12px above and below the words.
    expect(css).toMatch(/\.wi-pkg-details::before \{[^}]*inset: -0\.75rem -0\.25rem;/);
    // The row is laid out as a service row: the ring at its end, filled with a tick when it is on the bill.
    expect(css).toMatch(/\.wi-service-list \.wi-card-pkg \{[^}]*grid-template-columns: 2\.75rem minmax\(0, 1fr\) 1\.5rem;/);
    expect(sheet).toMatch(/className="wi-card-hit"\s+aria-pressed=\{on\}/);
  });

  it('adds a package to the bill beside the services already on it, never instead of them', () => {
    // Record payment keeps the single services as extras beside the package; New booking still replaces.
    expect(sheet).toMatch(/const singles = comboActive \? extras : picked;/);
    expect(sheet).toMatch(/setExtras\(forPayment \? singles : \[\]\);/);
    // A service inside the package is not counted on its own row, and − cannot take the package apart.
    expect(sheet).toMatch(/\(comboActive \? 0 : picked\.filter\(\(x\) => x\.serviceId === serviceId\)\.length\)/);
    expect(sheet).toMatch(/if \(e >= 0\) return removeExtraAt\(e\);\s*if \(comboActive\) return;/);
  });

  it('says both new sentences in both languages', () => {
    const en = enMessages.newVisit as Record<string, string>;
    const hi = hiMessages.newVisit as Record<string, string>;
    for (const key of ['addNameAndNumber', 'inThisBill', 'totalCanDiffer', 'servicesMissing', 'allServices', 'serviceKinds', 'trayTotal', 'trayTotalA11y', 'addPhoneNumber', 'qtyOnBill', 'oneMore', 'oneLess', 'packagesChip', 'viewDetails', 'viewDetailsOf', 'packageSeparately', 'packagePrice', 'addToBill', 'takeOffBill']) {
      expect(en[key], `en.${key}`).toBeTruthy();
      expect(hi[key], `hi.${key}`).toBeTruthy();
    }
    // The clock itself needs no sentence around it: Intl formats it for the locale.
    expect(en.nowAt).toBeUndefined();
    expect(hi.nowAt).toBeUndefined();
  });
});
