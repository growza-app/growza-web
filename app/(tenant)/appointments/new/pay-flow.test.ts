import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import enMessages from '../../../../messages/en.json';
import hiMessages from '../../../../messages/hi.json';
import { spread } from './PayFlow';
import { toNationalDigits } from '../../lib/phone';

const here = dirname(fileURLToPath(import.meta.url));
const flow = readFileSync(resolve(here, 'PayFlow.tsx'), 'utf8');
const keypad = readFileSync(resolve(here, 'Keypad.tsx'), 'utf8');
const wrapper = readFileSync(resolve(here, 'NewBookingClient.tsx'), 'utf8');
const client = readFileSync(resolve(here, 'ClientSheet.tsx'), 'utf8');
// Moved to components/ 2026-10-10: New booking's Services row opens this same search, and a component two
// screens share does not live inside one of them.
const menu = readFileSync(resolve(here, '../../components/ServiceSheet.tsx'), 'utf8');
const bill = readFileSync(resolve(here, 'BillCard.tsx'), 'utf8');
const page = readFileSync(resolve(here, 'page.tsx'), 'utf8');
const css = readFileSync(resolve(here, '../../styles/73-pay-flow.css'), 'utf8');
const globals = readFileSync(resolve(here, '../../globals.css'), 'utf8');
const routes = readFileSync(resolve(here, '../../lib/branch-routes.ts'), 'utf8');
const viewportHeight = readFileSync(resolve(here, '../../components/ViewportHeight.tsx'), 'utf8');
const modeSwitch = readFileSync(resolve(here, 'FormModeSwitch.tsx'), 'utf8');
const visitSheet = readFileSync(resolve(here, '../../components/NewVisitSheet.tsx'), 'utf8');
/** Owner, 2026-10-10 — the done screen both Record payment forms end on, and what it sounds like. */
const done = readFileSync(resolve(here, '../../components/PaymentDone.tsx'), 'utf8');
const feedback = readFileSync(resolve(here, '../../lib/pay-feedback.ts'), 'utf8');
const receipt = readFileSync(resolve(here, '../../components/ReceiptShare.tsx'), 'utf8');
const walkInCss = readFileSync(resolve(here, '../../styles/72-walk-in-sheet.css'), 'utf8');

/*
 * Owner, 2026-10-09 — Record payment on a phone is three screens and three taps, for an owner who does not read
 * well: pictures where there were words, one question per screen, nothing typed. These pin the shape, so a later
 * change cannot quietly put a text box back or make the tiles small.
 */
describe('one done screen for both Record payment forms (owner, 2026-10-10)', () => {
  it('the three-tap flow and the one-page form both end on PaymentDone, and nothing else', () => {
    expect(flow).toMatch(/import \{ PaymentDone \} from '\.\.\/\.\.\/components\/PaymentDone';/);
    expect(visitSheet).toMatch(/import \{ PaymentDone \} from '\.\/PaymentDone';/);
    expect(visitSheet).toMatch(/stage\.step === 'paid' \? \(\s*<PaymentDone/);
    // On the page it is the whole page — no form header or card around it, as the three-tap flow ends.
    expect(visitSheet).toMatch(/if \(paidScreen && presentation === 'page'\) return paidScreen;/);
    // A desk always ends on it too, in the phone's column rather than across the whole page.
    expect(css).toMatch(/@media \(min-width: 861px\) \{\s*\.pf-done-page \{\s*width: 100%;\s*max-width: 30rem;\s*margin-inline: auto;/);
    // The one-page form's old paid screen — "Paid", the bill, a lone Done — is gone, not kept beside it.
    expect(visitSheet).not.toMatch(/nv\.paid\(/);
    // Next customer opens a fresh one-page form.
    expect(visitSheet).toMatch(/onNextCustomer=\{onAnother \?\? onClose\}/);
    expect(wrapper).toMatch(/key=\{run\}\s*onAnother=\{purpose === 'payment' \? another : undefined\}/);
  });

  it('says the exact amount, paise and all', async () => {
    const { spokenAmount } = await import('../../components/PaymentDone');
    expect(spokenAmount(45000, 'en')).toBe('450');
    expect(spokenAmount(64950, 'en')).toBe('649.50');
    expect(spokenAmount(150000, 'en')).toBe('1,500');
  });
});

describe('Record payment in three taps', () => {
  it('is the phone flow only; a desk and ?full=1 keep the one-page form', () => {
    expect(wrapper).toMatch(/const quick = purpose === 'payment' && !full;/);
    expect(wrapper).toMatch(/window\.matchMedia\('\(max-width: 860px\)'\)\.matches \? 'phone' : 'desk'/);
    // Nothing is drawn until the browser has said which — not a form that flashes up and is replaced.
    expect(wrapper).toMatch(/if \(quick && layout === 'unknown'\) return <div className="pf" aria-busy="true" \/>;/);
    expect(page).toMatch(/full=\{params\.full === '1'\}/);
    // The way back to the full form is on the screen itself, for the sale this cannot write.
    expect(flow).toMatch(/const fullForm = `\/appointments\/new\?purpose=payment&full=1/);
  });

  it('has no text field on its screens: the keyboard never comes up by itself', () => {
    for (const src of [flow, keypad]) {
      expect(src).not.toMatch(/<input/);
      expect(src).not.toMatch(/<textarea/);
      expect(src).not.toMatch(/contentEditable/);
    }
    // The client sheet is the exception, and deliberately: its three fields are a find box and the two an add
    // needs, all behind a tap on a search bar — the person asked for the keyboard. It is ONE screen: no pad, no
    // step that swaps the sheet's contents out (owner, 2026-10-10).
    expect((client.match(/<input/g) ?? []).length).toBe(3);
    expect(client).not.toMatch(/<Keys\b/);
    // Tapping a search bar IS asking for the keyboard, so that box takes focus. The + is not asking for one, so
    // the number field takes focus only where none would follow it (owner, 2026-10-10).
    expect(client).toMatch(/if \(!startAdding\) box\.current\?\.focus\(\{ preventScroll: true \}\);/);
    expect(client).toMatch(/else if \(!opensSoftKeyboard\(\)\) focusPhone\(\);/);
    expect(client).toMatch(/if \(!opensSoftKeyboard\(\)\) setTimeout\(focusPhone, 0\);/);
    expect(client).toMatch(/className="pf-client-add-row"/);
    expect(client).not.toMatch(/autoFocus/);
  });

  it('asks one question per screen, in that order', () => {
    expect(flow).toMatch(/useState<'what' \| 'how' \| 'done'>\('what'\)/);
    expect(flow).toMatch(/\{t\('whatTitle'\)\}/);
    expect(flow).toMatch(/\{t\('howTitle'\)\}/);
    expect(flow).toMatch(/<PaymentDone\s/);
    expect(done).toMatch(/\{t\('doneTitle', \{ amount: formatMoney\(String\(totalMinor\)\) \}\)\}/);
  });

  it('draws the menu as photo tiles two across, each the height of a thumb and a half', () => {
    expect(flow).toMatch(/<img className="pf-tile-photo" src=\{servicePhotoUrl\(s\)\}/);
    expect(css).toMatch(/\.pf-tiles \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(css).toMatch(/\.pf-tile \{[^}]*min-height: 9\.5rem;/);
    // A tap adds one. Once something is on the bill the tile wears − n +, so a second one is a visible choice
    // and not a guess that tapping the photo again works (owner, 2026-10-10); both are 44px and outside the tile's
    // own button, which cannot nest a control.
    expect(flow).toMatch(/onClick=\{\(\) => addOne\(s\)\}/);
    expect(flow).toMatch(/className="pf-tile-qty" role="group"/);
    expect(flow).toMatch(/aria-label=\{t\('oneLess', \{ name: s\.name \}\)\} onClick=\{\(\) => oneLess\(s\.id\)\}/);
    expect(flow).toMatch(/aria-label=\{t\('oneMore', \{ name: s\.name \}\)\} onClick=\{\(\) => addOne\(s\)\}/);
    expect(css).toMatch(/\.pf-qty-btn \{\s*width: 2\.75rem;\s*height: 2\.75rem;/);
  });

  it('asks who is paying with a bar that looks like search and a plus beside it', () => {
    // Owner, 2026-10-09 — the row was one small chip in an empty row; a bar says "type a name here" wordlessly.
    expect(flow).toMatch(/className="pf-who-search" onClick=\{\(\) => setWhoOpen\('find'\)\}/);
    expect(flow).toMatch(/className="pf-who-add" aria-label=\{t\('addClient'\)\} onClick=\{\(\) => setWhoOpen\('add'\)\}/);
    // Nobody named IS the walk-in, and nobody picked for the stylist is nobody: neither gets a chip saying so.
    expect(flow).not.toMatch(/t\('walkIn'\)|t\('nobody'\)/);
    // A picked client is a card with the way back to a walk-in on it.
    expect(flow).toMatch(/className="pf-who-clear"[\s\S]{0,120}setClient\(\{ kind: 'none' \}\)/);
    // The plus opens the same sheet with its add row already expanded; it is not a second screen.
    expect(client).toMatch(/const \[adding, setAdding\] = useState\(startAdding\);/);
    expect(css).toMatch(/\.pf-who-add \{[^}]*width: 3rem;[^}]*height: 3rem;/);
  });

  it('shows what the total is made of, and lets a line go from there', () => {
    // The tray shows one figure, and a figure typed over the list price is the only thing that knows it changed.
    // One row: the link sits in the line that labels the figure, not stacked over the button (owner, 2026-10-10).
    // The whole label row opens the bill — one 44px target, not a 23px link resting on the total figure.
    expect(flow).toMatch(/className="pf-total-label pf-total-label-tap" onClick=\{\(\) => setBillOpen\(true\)\}/);
    expect(flow).toMatch(/<span className="pf-view-bill">\{t\('viewDetails'\)\}<\/span>/);
    expect(css).toMatch(/\.pf-total-label \{[\s\S]{0,200}min-height: 2\.75rem;/);
    expect(css).toMatch(/\.pf-total \{[\s\S]{0,400}min-height: 2\.75rem;/);
    expect(flow).not.toMatch(/pf-tray-go|pf-tray-money/);
    // The label spans the tray, so the figure and the button are side by side and share a centre line: centring
    // the button against a label-plus-figure block left ₹450 twelve pixels below Next (owner, 2026-10-10).
    expect(css).toMatch(/\.pf-total-label \{\s*grid-column: 1 \/ -1;/);
    expect(bill).toMatch(/\{t\('billList'\)\}/);
    expect(bill).toMatch(/offMinor > 0 \? t\('billOff'\) : t\('billExtra'\)/);
    // Same service twice is one row with a count, as the receipt groups it; each row can lose one from here.
    expect(bill).toMatch(/same\.count \+= 1;/);
    expect(bill).toMatch(/onLess\(r\.serviceId\)/);
    expect(css).toMatch(/\.pf-bill-less \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
  });

  it('closes every sheet on a tap outside it', () => {
    // The dimmed area closes the sheet, as `sheet-backdrop` does everywhere else; Escape already did (useDialog).
    for (const src of [keypad, client, menu, bill]) {
      expect(src).toMatch(/className="pf-keypad-scrim" onPointerDown=\{\(e\) => e\.target === e\.currentTarget && onClose\(\)\}/);
    }
  });

  it('opens the whole menu in the flow, from a bar above the tiles', () => {
    // It was a link to ?full=1 (which left the three taps for a form), then a tile at the END of the grid —
    // eight photos past the eye. A bar under the two people rows is where a search is looked for.
    expect(flow).toMatch(/className="pf-who-search pf-find-service" onClick=\{\(\) => setMenuOpen\(true\)\}/);
    expect(flow).not.toMatch(/pf-tile-more/);
    expect(menu).toMatch(/matchItems\(pool\.map/); // the same spelling tolerance the full form has
    expect(menu).toMatch(/servicePhotoUrl\(s\)/);
  });

  it('never moves a tile the finger is already on', () => {
    /*
     * Owner, 2026-10-10 — every service on the bill used to be hoisted to the front of the grid, so tapping
     * the sixth tile sent it to the first: 336px up the screen, measured in the browser, leaving the finger
     * on a different service at two and a half times the price. The screen is built around "tap again for a
     * second one", so reordering under that finger is the one thing the grid must not do.
     */
    expect(flow).toMatch(/const pinned = new Set\(token\?\.serviceIds \?\? \[\]\);/);
    expect(flow).toMatch(/const shown = order\.filter\(\(s\) => pinned\.has\(s\.id\)\);/);
    // Only the token's services are pinned: they are fixed before the screen is drawn and cannot move after it.
    expect(flow).not.toMatch(/order\.filter\(\(s\) => chosen\.has\(s\.id\)\)/);
    // A service found by searching still gets a tile — appended, so it carries its count and its − + .
    expect(flow).toMatch(/for \(const l of lines\) \{[\s\S]{0,220}shown\.push\(s\);/);
    // Whether the search bar is there follows the size of the MENU, not a tile count that grows as it is used.
    expect(flow).toMatch(/\{services && services\.length > TILES \? \(/);
  });

  it('tapping how they paid IS the save — there is no Mark done', () => {
    expect(flow).toMatch(/onClick=\{\(\) => void pay\(mode\)\}/);
    expect(flow).not.toMatch(/markDone/);
    // The one call the full form makes for a sale with no chair (GRW-293) or a token (GRW-403); nothing new.
    expect(flow).toMatch(/api\.recordCounterSale\(/);
    expect(flow).toMatch(/idempotencyKey: attemptKey/);
    // Four tiles two across, Other among them rather than a text link beneath them.
    expect(flow).toMatch(/\(\['cash', 'upi', 'card', 'other'\] as const\)\.map/);
    expect(css).toMatch(/\.pf-pay \{[\s\S]{0,80}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    // Colour is on the icon, not behind the whole card: four instances of one thing, told apart by a pale ground.
    for (const mode of ['cash', 'upi', 'card', 'other']) {
      expect(css).toMatch(new RegExp(`\\.pf-pay-${mode} \\{\\s*background: #[0-9a-f]{6};`));
      expect(css).toMatch(new RegExp(`\\.pf-pay-${mode} \\.pf-pay-icon \\{\\s*background: #[0-9a-f]{6};`));
    }
    // Each says what it means underneath, in both languages — never instead of the word.
    expect(flow).toMatch(/<span className="pf-pay-sub">\{t\(`sub\.\$\{mode\}`\)\}<\/span>/);
    for (const m of [enMessages, hiMessages]) {
      const subs = (m.payFlow as unknown as { sub: Record<string, string> }).sub;
      expect(Object.keys(subs).sort()).toEqual(['card', 'cash', 'other', 'upi']);
    }
    // Two lines reserved under every word, so one longer phrase cannot step its whole grid row taller.
    expect(css).toMatch(/\.pf-pay-sub \{[\s\S]{0,200}-webkit-line-clamp: 2;/);
    expect(css).toMatch(/\.pf-pay-sub \{[\s\S]{0,260}min-height: 2\.6em;/);
    {
    }
  });

  it('switches between the simple and the full form from either side', () => {
    // A ☰ that opened a different form, with no way back, is two labelled halves in the same corner on both.
    expect(flow).not.toMatch(/IconMenu|pf-full/);
    expect(modeSwitch).toMatch(/now === 'simple' \? 'page' : undefined/);
    expect(flow).toMatch(/<FormModeSwitch now="simple" simpleHref=\{simpleForm\} advancedHref=\{fullForm\} \/>\s*<\/header>/);
    // Beside the title, not on the step dots' line, where it read as a step in the sale.
    expect(css).toMatch(/\.pf-head \{[\s\S]{0,200}grid-template-columns: 2\.75rem minmax\(0, 1fr\) auto;/);
    expect(css).toMatch(/\.pf-title \{[\s\S]{0,600}text-align: left;/);
    expect(visitSheet).toMatch(/<FormModeSwitch now="advanced"/);
    // A token being paid keeps its token across the switch.
    expect(flow).toMatch(/const payToken = token \?/);
    expect(visitSheet).toMatch(/const payTokenQuery = token \?/);
    // At a desk the full form IS Record payment, so there is nothing to switch to.
    expect(css).toMatch(/@media \(min-width: 861px\) \{\s*\.sheet-head \.pf-modes \{\s*display: none;/);
    for (const m of [enMessages, hiMessages]) {
      const w = m.payFlow as unknown as Record<string, string>;
      expect(w.simple).toBeTruthy();
      expect(w.advanced).toBeTruthy();
      expect(w.fullForm).toBeUndefined();
    }
  });

  it('keeps a sheet above the soft keyboard instead of behind it', () => {
    // `position: fixed` is pinned to the layout viewport, which a keyboard does not shrink — so a sheet at
    // bottom: 0 ends up under the keyboard, hiding the field that opened it.
    expect(css).toMatch(/\.pf-keypad-scrim \{[\s\S]{0,700}padding-bottom: var\(--kb, 0px\);/);
    // …and it has to fit in what is left, scrolling inside itself rather than running off the top.
    expect(css).toMatch(/max-height: calc\(min\(100dvh, var\(--app-h, 100dvh\)\) - var\(--kb, 0px\)\);/);
    expect(css).toMatch(/\.pf-keypad \{[\s\S]{0,700}overscroll-behavior: contain;/);
    // The client sheet's own older cap is gone: later in the file, it was quietly winning.
    expect(css).not.toMatch(/\.pf-client \{\s*max-height/);
    // `--kb` is the gap between the window and what is actually on screen, with a floor so a URL bar is not a keyboard.
    expect(viewportHeight).toMatch(/const covered = seen \? Math\.max\(0, h - \(seen\.height \+ seen\.offsetTop\)\) : 0;/);
    expect(viewportHeight).toMatch(/const KEYBOARD_MIN_PX = 80;/);
    expect(viewportHeight).toMatch(/root\.style\.removeProperty\('--kb'\);/);
    // Save stays on screen while the fields scroll behind it: at ~290px of sheet it sat 62px past the edge.
    expect(css).toMatch(/\.pf-client-links \{[\s\S]{0,200}position: sticky;\s*bottom: 0;/);
    expect(css).toMatch(/\.pf-client-links \{[\s\S]{0,400}margin-bottom: calc\(\(var\(--sp-4\) \+ env\(safe-area-inset-bottom, 0px\)\) \* -1\);/);
    // …and what scrolls behind it is never left UNDER it (owner's bug report, 2026-10-10: the phone box sat half
    // under Save client). The sheet's scroll padding is the bar's measured height, and the focused field is scrolled
    // back into view when it takes focus and whenever the keyboard resizes the sheet.
    expect(css).toMatch(/\.pf-keypad\.pf-client \{\s*scroll-padding-bottom: calc\(var\(--pf-bar-h, 0px\) \+ var\(--sp-2\)\);/);
    // At rest too: the negative margin that cancelled the sheet's padding let Chrome push the bar 16px up over the
    // phone box. Now the sheet drops its own bottom padding while the bar is there, and the bar's margin is 0.
    expect(css).toMatch(/\.pf-keypad\.pf-client:has\(\.pf-client-links\) \{\s*padding-bottom: 0;/);
    expect(css).toMatch(/\.pf-keypad\.pf-client \.pf-client-links \{\s*margin-bottom: 0;/);
    expect(client).toMatch(/sheet\.style\.setProperty\('--pf-bar-h', `\$\{bar\?\.offsetHeight \?\? 0\}px`\)/);
    expect(client).toMatch(/sheet\.addEventListener\('focusin', onFocus\)/);
    expect(client).toMatch(/window\.visualViewport\?\.addEventListener\('resize', onFocus\)/);
    expect(client).toMatch(/new ResizeObserver\(reveal\)/);
    expect(client).toMatch(/\(el\.closest<HTMLElement>\('\.field'\) \?\? el\)\.scrollIntoView\(\{ block: 'nearest' \}\)/);
  });

  it('lets the counter pick its branch, and empties the bill when it changes', () => {
    // The app's one picker, not a second dropdown: it already hides itself for a one-branch business and shows
    // a plain name to a receptionist held to one.
    expect(flow).toMatch(/<HeaderBranchPicker variant="line" \/>/);
    // The branch is the title's second line — one header instead of a title row, a branch row and the gap
    // between them — and toned down: context, not the third-loudest thing on the screen.
    expect(flow).toMatch(/<span className="pf-head-stack">\s*<h1 className="pf-title">/);
    expect(css).toMatch(/\.pf-head-stack \{\s*display: grid;/);
    expect(css).toMatch(/\.pf-head-stack \.hbp-line \.sbp-btn\.is-branch \{[\s\S]{0,220}color: var\(--muted\);/);
    expect(css).toMatch(/\.pf-head-stack \.hbp-line \.sbp-btn > svg \{\s*color: var\(--accent-deep\);/);
    // A ~26px picker still gets a 44px thumb, the same way the form switch does.
    expect(css).toMatch(/\.pf-head-stack \.hbp-line \.sbp-btn::after \{[\s\S]{0,220}height: 2\.75rem;/);
    // Three dots marking 1 of 3 on a flow whose every screen says what it is, and whose button says what is next.
    expect(css).not.toMatch(/\.pf-dots/);
    expect(flow).not.toMatch(/pf-dot|const dots =/);
    expect(flow).toMatch(/import \{ HeaderBranchPicker \} from '\.\.\/\.\.\/components\/HeaderBranchPicker';/);
    // A sale is taken at one counter, so the picker offers branches and never "All".
    expect(routes).toMatch(/const ONE_BRANCH_ONLY = \[[^\]]*'\/appointments\/new'\]/);
    // A service and a stylist belong to ONE branch, so a bill built at the old one cannot follow.
    expect(flow).toMatch(/if \(token \|\| branchWas\.current === location\) return;\s*branchWas\.current = location;\s*setLines\(\[\]\);/);
    expect(flow).toMatch(/setStylistId\(null\);/);
    // A token's branch is the token's: it keeps the plain line and is never offered the picker.
    expect(flow).toMatch(/branchName \? <span className="pf-at">\{t\('at', \{ branch: branchName \}\)\}<\/span> : null/);

    // Services is a labelled row like Who? and Stylist, and the empty + column keeps both bars one size.
    expect(flow).toMatch(/<span className="pf-row-label">\{t\('services'\)\}<\/span>/);
    expect(flow).toMatch(/<span className="pf-who-add pf-who-gap" aria-hidden="true" \/>/);
    // One layout at every width: the label beside its control, no breakpoint. The 360px switch that used to
    // stack them landed on the commonest Android width there is, so two owners saw two different screens.
    expect(css).toMatch(/\.pf-row \{\s*display: grid;\s*grid-template-columns: auto minmax\(0, 1fr\);/);
    expect(css).not.toMatch(/@media \(max-width: 360px\)/);
    // The floor squares the two bars up; the tight gap and the countless label are what make them fit at 344.
    expect(css).toMatch(/\.pf-row-label \{\s*min-width: 4rem;/);
    expect(css).toMatch(/\.pf-row \{[\s\S]{0,120}gap: var\(--sp-2\);/);
    expect(flow).toMatch(/\{t\('searchCount'\)\}/);
    for (const m of [enMessages, hiMessages]) expect((m.payFlow as unknown as Record<string, string>).services).toBeTruthy();
    // White inside, green edge: a grey hairline on a grey page was 1.03:1 and read as nothing.
    expect(css).toMatch(/\.pf-who-search \{[\s\S]{0,460}border: 1\.5px solid var\(--accent-deep\);/);
    expect(css).toMatch(/\.pf-who-search \{[\s\S]{0,520}background: var\(--surface\);/);
  });

  it('will not record a sale against nobody — a name is required, a number is not', () => {
    // Owner, 2026-10-10, said twice: a salon should know who it served. The shared anonymous row is gone.
    expect(flow).not.toMatch(/WALK_IN_CLIENT|walkInClient/);
    expect(flow).toMatch(/const canGoOn = lines\.length > 0 && \(token !== undefined \|\| client\.kind !== 'none'\);/);
    // The refusal says what is missing, and opens the sheet that fixes it when the client is all that is.
    expect(flow).toMatch(/if \(client_ && !service\) setWhoOpen\('add'\);/);
    // A token already carries its client, so it is never asked.
    expect(flow).toMatch(/token \? \{ queueEntryId: token\.id \}/);
    // A name with no number is not a row this screen writes: the counter-sale route creates it with the sale.
    expect(flow).toMatch(/\{ customerName: \(client as \{ name: string \}\)\.name \}/);
    expect(client).toMatch(/if \(!stored\) return onPick\(\{ id: null, name: newName\.trim\(\), waPhone: null \}\);/);
    // Save needs the name; the number only has to be valid IF one was typed.
    expect(client).toMatch(/const problem = checkPhone\(newPhone, \{ required: false \}\);/);
    expect(client).toMatch(/disabled=\{saving \|\| !named \|\| problem !== null\}/);
    for (const m of [enMessages, hiMessages]) {
      const w = m.payFlow as unknown as Record<string, string>;
      expect(w.needClient).toBeTruthy();
      expect(w.phoneNumber).toMatch(/\(|\u0928\u0939/);
    }
  });

  it('refuses for both reasons at once, each marked where its answer goes', () => {
    /*
     * Owner, 2026-10-10 — Next stopped at the first thing missing, so an empty screen said only "Tap a
     * service" and taught about the client one tap later. Both are now asked for together.
     */
    expect(flow).toMatch(/setMissing\(\{ client: client_, service \}\);/);
    // Each mark is tied to the thing still missing, so answering one does not clear the other's.
    expect(flow).toMatch(/const badClient = Boolean\(missing\?\.client\) && !token && client\.kind === 'none';/);
    expect(flow).toMatch(/const badService = Boolean\(missing\?\.service\) && lines\.length === 0;/);
    // Beside the control, not one sentence in the tray a thumb's length from the fix.
    expect(flow).toMatch(/\{badClient \? \(\s*<p className="pf-miss" role="alert">\s*\{t\('needClient'\)\}/);
    expect(flow).toMatch(/\{badService \? \(\s*<p className="pf-miss pf-miss-wide" role="alert">\s*\{t\('pickOne'\)\}/);
    expect(flow).toMatch(/className=\{`pf-who-bar \$\{badClient \? 'pf-bad' : ''\}`\}/);
    expect(css).toMatch(/\.pf-miss \{[\s\S]{0,160}color: #991b1b;/);
    // The word says what is wrong; the colour only helps the eye find it.
    for (const m of [enMessages, hiMessages]) {
      const w = m.payFlow as unknown as Record<string, string>;
      expect(w.pickOne).toBeTruthy();
      expect(w.needClient).toBeTruthy();
    }
  });

  it('says the amount out loud on the done screen, and can be told not to', () => {
    expect(done).toMatch(/new SpeechSynthesisUtterance\(t\('spoken', \{ amount: spokenAmount\(totalMinor, locale\), mode: modeLabel \}\)\)/);
    expect(done).toMatch(/u\.lang = locale === 'hi' \? 'hi-IN' : 'en-IN';/);
    expect(done).toMatch(/if \(!\(soundProp \?\? soundIsOn\(\)\)\) return;/);
    expect(done).toMatch(/aria-pressed=\{sound\} onClick=\{toggleSound\}/);
    // One setting for both forms: PayFlow passes its own, the one-page form lets the screen read it.
    expect(flow).toMatch(/sound=\{sound\}\s*onToggleSound=\{toggleSound\}/);
    // Reduced motion stills the tick; the sound is the person's own switch.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.pf-done-check \{\s*animation: none;/);
  });

  it('fits the done screen on one phone: the bill is shown, capped, and scrolls in place', () => {
    // 232px of tick-above-amount plus 284px of bill put Next customer — pressed after every sale — below the fold.
    expect(done).toMatch(/<ReceiptShare bill=\{bill\} phone=\{phone\} compactPreview/);
    expect(receipt).toMatch(/compactPreview \? 'wi-receipt-paper-short' : ''/);
    expect(walkInCss).toMatch(/\.wi-receipt-paper-short \{[\s\S]{0,120}max-height: 12rem;[\s\S]{0,60}overflow-y: auto;/);
    // Still shown, never folded away: the desk reads the bill before it sends it.
    expect(receipt).not.toMatch(/<details/);
    // A region a mouse can scroll is one a keyboard must reach.
    expect(receipt).toMatch(/tabIndex=\{compactPreview \? 0 : undefined\}/);
    // The tick sits beside the amount rather than on its own floor.
    expect(css).toMatch(/\.pf-done \{[\s\S]{0,420}grid-template-columns: auto minmax\(0, 1fr\);/);
    expect(css).toMatch(/\.pf-done-check \{[\s\S]{0,120}width: 3\.5rem;/);
    // "I'm done" and "Fix a mistake" share a row; neither is the button pressed after a sale.
    expect(css).toMatch(/\.pf-done-minor \{[\s\S]{0,120}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });

  it('says how far off a half-typed number is, and never corrupts a pasted one', () => {
    // The app's own field, not a bare <input type="tel">: `slice(0, 10)` on the digits turned a pasted
    // "+91 98765 43210" into 9198765432 — ten digits, a valid first digit, saved as somebody else's number.
    expect(client).toMatch(/<PhoneField/);
    expect(client).not.toMatch(/setNewPhone\(e\.target\.value/);
    expect(client).toMatch(/import \{ PhoneField \} from '\.\.\/\.\.\/components\/PhoneField';/);
    // The countdown runs from the first digit; an untouched box is left alone.
    expect(client).toMatch(/const shownProblem = newPhone\.length > 0 \? problem : null;/);
    // Save stays shut until the number is real, whatever the field is saying.
    // Both fields in the row are the app's `.field`, and both fill it.
    expect(client).toMatch(/<div className="field">\s*<label htmlFor=\{NAME_ID\}>/);
    expect(css).toMatch(/\.pf-client-add-row \.field input \{\s*width: 100%;/);
    expect(css).not.toMatch(/\.pf-client-name/);
  });

  it('carries what was typed to find somebody into the fields that add them', () => {
    // Opened from the +, the add row is already up and the search box is still above it: typing a number there
    // and finding nobody must not mean typing the same ten digits again.
    expect(client).toMatch(/if \(!adding \|\| !nobody \|\| ownFields\.current \|\| !typed\) return;\s*if \(typedIsNumber\) setNewPhone\(toNationalDigits\(typed\)\);\s*else setNewName\(typed\);/);
    // …and it stops the moment either field is touched by hand, or filled from the phone's contacts.
    expect(client).toMatch(/ownFields\.current = true;\s*setNewName\(e\.target\.value\)/);
    expect(client).toMatch(/ownFields\.current = true;\s*setNewPhone\(digits\);/);
    expect(client).toMatch(/ownFields\.current = true;\s*setAdding\(true\)/);
    // Normalised by the app's own `toNationalDigits`, not a second copy of that rule living in this sheet.
    expect(client).toMatch(/if \(typedIsNumber\) setNewPhone\(toNationalDigits\(typed\)\);/);
    expect(toNationalDigits('98765 43210')).toBe('9876543210');
    expect(toNationalDigits('+91 98765 43210')).toBe('9876543210');
    expect(toNationalDigits('09876543210')).toBe('9876543210');
  });

  it('gives every tile row the same height, and fits the name that tells two tiles apart', () => {
    // One line held open on every tile: rows stay level without paying 20px a tile for the four names that
    // would have used a second one.
    expect(css).toMatch(/\.pf-tile-name \{[\s\S]{0,600}min-height: 1\.25em;/);
    expect(css).toMatch(/\.pf-tile-name \{[\s\S]{0,640}-webkit-line-clamp: 1;/);
    // 14px, because at 16 "Anti-Ageing Facial" clipped to "Anti-Ageing…" beside a plain "Facial" at another price.
    expect(css).toMatch(/\.pf-tile-name \{[\s\S]{0,600}font-size: 0\.875rem;/);
    expect(css).toMatch(/-webkit-line-clamp: 2;/);
  });

  it('buzzes the taps that change the bill, and only those', () => {
    // A tick on the way up, nothing on the way down: the two must not feel the same.
    expect(flow).toMatch(/felt\(BUZZ\.added\);\s*setLines\(\(prev\) => \[\.\.\.prev, toLine\(s\)\]\);/);
    expect(feedback).toMatch(/added: 10,/);
    expect(flow).not.toMatch(/const oneLess = [\s\S]{0,200}felt\(/);
    // The refusal at twelve lines has its own pattern, so it cannot be mistaken for a success.
    expect(flow).toMatch(/if \(full\) \{\s*felt\(BUZZ\.tooMany\);\s*return;/);
    expect(feedback).toMatch(/tooMany: \[20, 40, 20\],/);
    // …and the + can still answer at the limit, which a `disabled` button could not.
    expect(flow).toMatch(/onClick=\{\(\) => addOne\(s\)\} aria-disabled=\{full \|\| undefined\}/);
    expect(css).toMatch(/\.pf-qty-btn\[aria-disabled='true'\] \{/);
    // The tap that writes the sale, and the screen that confirms it.
    expect(flow).toMatch(/if \(saving \|\| lines\.length === 0\) return;\s*felt\(BUZZ\.paid\);/);
    expect(done).toMatch(/if \(!\(soundProp \?\? soundIsOn\(\)\)\) return;\s*buzz\(BUZZ\.done\);/);
    expect(done).toMatch(/if \(said\.current === appointmentId\) return;/);
    // The person's own switch covers touch as well as sound; and a phone without `vibrate` is not an error.
    expect(flow).toMatch(/const felt = \(pattern: number \| readonly number\[\]\) => \{\s*if \(sound\) buzz\(pattern\);/);
    expect(feedback).toMatch(/navigator\.vibrate\?\.\(/);
    // Never from an effect: a fast pair of taps re-renders more often than it adds.
    expect(flow).not.toMatch(/useEffect\([\s\S]{0,120}buzz\(BUZZ\.(added|tooMany|paid)\)/);
  });

  it('keeps the client from the number given for the bill, and never from a prefilled one', () => {
    // ① still asks nobody for a name; the capture is on ③, where the client wants something for the number.
    expect(done).toMatch(/onNumberGiven=\{givenPhone \? undefined : keepClient\}/);
    expect(done).toMatch(/api\s*\.assignClientToSale\(appointmentId, \{ phone: typed \}\)/);
    // A token's client, a BOOKING's client (2026-10-10) and a client picked on ① are already attached, so
    // their number arrives prefilled — which is what switches the capture above off. A booking whose client
    // gave no number has none to prefill, and is offered the capture like any other sale.
    expect(flow).toMatch(
      /phone: token\?\.customerPhone \?\? visit\?\.appointment\.customerPhone \?\? \(client\.kind === 'existing' \? client\.phone : null\)/,
    );
    expect(receipt).toMatch(/const \[editing, setEditing\] = useState\(!phone\)/);
    // "Change" on a client's own bill sends THIS bill elsewhere; it must never re-point their record.
    expect(receipt).toMatch(/if \(onNumberGiven && !phone\) onNumberGiven\(toStoredPhone\(typed\)!\);/);
    // The bill never waits on it, and a failure says so without taking the screen.
    expect(done).toMatch(/\.catch\(\(\) => setKept\('failed'\)\)/);
    expect(done).toMatch(/kept === 'failed' \? t\('clientNotKept'\)/);
    // Each sale's screen is a fresh mount, so its kept state cannot carry into the next sale.
    expect(flow).toMatch(/appointmentId=\{sale\.appointmentId\}/);
    const en = enMessages.payFlow as unknown as Record<string, string>;
    expect(en.clientKept).toBeTruthy();
    expect(en.clientNotKept).toBeTruthy();
  });

  it('spreads a changed total over the lines by list price, the last line taking the rounding', () => {
    const lines = [{ priceMinor: 30000 }, { priceMinor: 30000 }, { priceMinor: 40000 }];
    expect(spread(lines, 50000)).toEqual([15000, 15000, 20000]);
    expect(spread(lines, 100000)).toEqual([30000, 30000, 40000]);
    expect(spread(lines, 33333)).toEqual([10000, 10000, 13333]);
    expect(spread(lines, 33333).reduce((a, b) => a + b, 0)).toBe(33333);
    // Free services: the whole amount lands on the last line rather than dividing by zero.
    expect(spread([{ priceMinor: 0 }, { priceMinor: 0 }], 5000)).toEqual([0, 5000]);
  });

  it('has its words in both languages, and its sheet before the tab strip', () => {
    const en = enMessages.payFlow as unknown as Record<string, string>;
    const hi = hiMessages.payFlow as unknown as Record<string, string>;
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    expect(en.spoken).toMatch(/\{amount\}.*\{mode\}/);
    expect(hi.spoken).toMatch(/\{amount\}.*\{mode\}/);
    const imports: string[] = globals.match(/@import '\.\/styles\/[^']+';/g) ?? [];
    const at = imports.indexOf("@import './styles/73-pay-flow.css';");
    expect(at).toBeGreaterThan(imports.indexOf("@import './styles/72-walk-in-sheet.css';"));
    expect(at).toBeLessThan(imports.indexOf("@import './styles/100-clay-tabs.css';"));
  });
});
