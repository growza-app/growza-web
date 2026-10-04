import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planPaymentLine } from './MoneyHero';
import { homeCopy } from '../../lib/home-copy';

/**
 * Jira GRW-312 — the phone money card, in words.
 *
 * Checked in a browser at 320 and 390px with two branches. These pin the decisions a screenshot
 * would not be taken to catch: the payment line's rule, that the pill carries the branch, that
 * Bookings narrows by it and validates it, and that the laptop card is left as it was.
 */
const here = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const code = (p: string) => here(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const slice = (mode: string, revenueMinor: number) => ({ mode, revenueMinor }) as never;

describe('the payment line', () => {
  it('one method is "All …", and reads as one', () => {
    const plan = planPaymentLine([slice('cash', 326000)]);
    expect(plan.only).toBe(true);
    expect(plan.shown).toHaveLength(1);
    expect(plan.more).toBe(0);
  });

  it('three methods all show, biggest first', () => {
    const plan = planPaymentLine([slice('card', 36000), slice('cash', 200000), slice('upi', 90000)]);
    expect(plan.shown.map((s) => s.mode)).toEqual(['cash', 'upi', 'card']);
    expect(plan.only).toBe(false);
    expect(plan.more).toBe(0);
  });

  it('four methods keep the three biggest and count the rest', () => {
    const plan = planPaymentLine([slice('cash', 100), slice('upi', 400), slice('card', 300), slice('other', 200)]);
    expect(plan.shown.map((s) => s.mode)).toEqual(['upi', 'card', 'other']);
    expect(plan.more).toBe(1);
  });

  it('"not recorded" alone is not called "all" of anything', () => {
    expect(planPaymentLine([slice('not_recorded', 100)]).only).toBe(false);
  });

  it('is worded in both languages, with a capital only for UPI', () => {
    expect(homeCopy('en').allPaidBy('Cash', 'cash')).toBe('All cash');
    expect(homeCopy('en').allPaidBy('UPI', 'upi')).toBe('All UPI');
    expect(homeCopy('hi').allPaidBy('नकद', 'cash')).toBe('सब नकद');
  });
});

describe('the card', () => {
  const hero = code('MoneyHero.tsx');

  it('draws the phone lines in a block the laptop never sees, and no graph in it', () => {
    expect(hero).toMatch(/className="hm-hero-phone hm-mobile"/);
    const phone = hero.slice(hero.indexOf('hm-hero-phone hm-mobile'), hero.indexOf('hm-hero-pay hm-desktop'));
    expect(phone).not.toMatch(/Sparkline|PaymentBar/);
  });

  it('keeps the laptop\'s bar and week graph, hidden on a phone instead of deleted', () => {
    expect(hero).toMatch(/className="hm-hero-pay hm-desktop"/);
    expect(hero).toMatch(/<Sparkline days=\{week\.days\} \/>/);
    expect(code('../../styles/86-money-card-phone.css')).toMatch(/\.hm-hero-week\s*\{\s*display:\s*none;/);
  });

  it('the not-marked count is stated once, by the card you can act from (Jira GRW-486)', () => {
    // The pill lived here from GRW-312 because "Needs your attention" was laptop-only. It is on the
    // phone now, directly below this card, so the pill would be the same count twice within 200px.
    expect(hero).not.toMatch(/hm-todo/);
    expect(hero).not.toMatch(/notMarkedPill/);
    expect(hero).not.toMatch(/unmarkedHref/);
    expect(code('../../styles/86-money-card-phone.css')).not.toMatch(/\.hm-todo/);
    // The copy it used goes with it: a string nothing renders is the flag that does nothing.
    expect(code('../../lib/home-copy.ts')).not.toMatch(/notMarkedPill/);
    // The link itself stays — the attention row is what carries it now, branch and all.
    expect(code('OwnerHome.tsx')).toMatch(/unmarked=1\$\{branch \? `&location=\$\{encodeURIComponent\(branch\)\}` : ''\}/);
    expect(code('OwnerHome.tsx')).toMatch(/href: unmarkedHref/);
  });

  it('the branch line is for All branches on every tab, its amounts being the period\'s (GRW-313)', () => {
    expect(hero).toMatch(/branches\.length > 1 && branchId === null && Boolean\(onPickBranch\)/);
    expect(hero).not.toMatch(/money\.period === 'today' && Boolean/);
    expect(hero).toMatch(/y\.b\.revenueMinor - x\.b\.revenueMinor/);
    expect(hero).toMatch(/<b>\{rupees\(b\.revenueMinor\)\}<\/b>/);
  });

  it('does not reuse the booking rows\' hm-pill class', () => {
    expect(hero).not.toMatch(/className="hm-pill"/);
    expect(code('../../styles/86-money-card-phone.css')).not.toMatch(/\.hm-pill\b/);
  });
});

describe('Bookings, when Home sends a branch', () => {
  const page = code('../../appointments/page.tsx');
  const list = code('../../appointments/BookingsList.tsx');

  it('takes only a branch this business has', () => {
    expect(page).toMatch(/\/\^\[0-9a-f-\]\{36\}\$\/i\.test\(locationParam\)/);
    expect(page).toMatch(/\(me\.branches \?\? \[\]\)\.find\(\(b\) => b\.id === locationParam\)/);
  });

  it('narrows the day before the tiles are counted, so they match the pill', () => {
    expect(list).toMatch(/groupBookings\(branch \? appointments\.filter\(\(a\) => a\.locationId === branch\.id\) : appointments\)/);
  });

  it("follows the header's branch, and keeps it through the date form (Jira GRW-395)", () => {
    // The branch is the header's now: no "Only X · Clear" chip of its own, which only repeated it.
    expect(list).not.toMatch(/t\('branchOnly'/);
    expect(list).toMatch(/\}, \[branchContext\.ready, branchContext\.choice\]\);/);
    expect(list).toMatch(/name="location" value=\{branch\.id\}/);
  });
});

describe('the period switch on the toolbar row (Jira GRW-313)', () => {
  const owner = code('OwnerHome.tsx');
  const css = code('../../styles/86-money-card-phone.css');

  it('is named for what it does, not "Today"', () => {
    expect(owner).toMatch(/label=\{t\.showMoneyFor\}/);
    expect(homeCopy('en').showMoneyFor).toBe('Show money for');
  });

  it("Home has no branch picker of its own: the header's picks for every screen (Jira GRW-395)", () => {
    const parts = code('parts.tsx');
    expect(owner).not.toMatch(/className="hm-branch"/);
    expect(owner).not.toMatch(/<BranchTabs/);
    expect(parts).toMatch(/<HeaderBranchPicker \/>/);
    expect(parts).toMatch(/\{locationName \? null : <HeaderBranchPicker variant="line" \/>\}/);
    // Home follows the header's choice whenever it moves, not only once when it arrives.
    expect(owner).toMatch(/\}, \[branchContext\.ready, branchContext\.choice\]\);/);
  });

  it('on a phone the branch keeps its name beside the date: the date gives way first', () => {
    const picker = code('../../styles/94-header-branch-picker.css');
    expect(picker).toMatch(/\.hm-head-branch \.hbp-line\s*\{\s*flex-shrink:\s*0;\s*max-width:\s*70%;/);
  });

  it('on a phone the period is a dropdown, not tabs — the row keeps its room for the branch picker', () => {
    const home = code('../../styles/83-role-home.css');
    const parts = code('parts.tsx');
    expect(parts).toMatch(/<select className="hm-seg-select" aria-label=\{label\}/);
    expect(home).toMatch(/\.hm-seg-select\s*\{\s*display:\s*none;/); // laptop: tabs only
    expect(home).toMatch(/\.hm-toolbar \.hm-seg\s*\{\s*display:\s*none;/); // phone: dropdown only
    expect(home).toMatch(/\.hm-toolbar \.hm-seg-select\s*\{\s*display:\s*block;/);
  });

  it('one branch: no rule gives the empty toolbar-end a share of the row, so the dropdown keeps its own width', () => {
    expect(css).not.toMatch(/(^|\})\s*\.hm-toolbar-end\s*\{[^}]*flex:\s*1 1 0/);
  });

  it('the change chip drops its words under 400px, so a seven-figure amount never runs into it', () => {
    expect(css).toMatch(/@media \(max-width: 400px\)\s*\{\s*\.hm-chip-words\s*\{\s*display:\s*none;/);
  });

  it('the card\'s top row leaves the flow, so the ⋯ sits in the corner and the eyebrow is gone', () => {
    expect(css).toMatch(/\.hm-hero-top\s*\{\s*position:\s*absolute;/);
    expect(css).toMatch(/\.hm-hero \.hm-hero-top \.hm-eyebrow\s*\{\s*display:\s*none;/);
    expect(css).toMatch(/\.hm-hero \.hm-hero-chip\s*\{\s*margin-right:\s*34px;/);
  });
});

/**
 * Jira GRW-486 — the three figures under the amount, at a reader's own text size.
 *
 * Measured in a browser at 344px: with `flex: 0 1 auto` on a `nowrap` row whose cells are
 * `white-space: nowrap` and have no `overflow` rule, every cell runs past its box by 2-3px at a
 * 20px root and by 13-18px at 23px, and the strip reads "2 bookings0 new client0% came back".
 * `layout.md > Be prepared for text-size changes` is explicit that adjacent views have to give
 * way so text is not cropped and does not overlap.
 */
describe('the figure strip at a larger text size (Jira GRW-486)', () => {
  const home = code('../../styles/83-role-home.css');
  const phoneBlock = () => {
    // The last `max-width: 860px` block that styles the strip — the one that sets the spread.
    const m = home.match(/@media \(max-width: 860px\) \{(?:(?!@media)[\s\S])*?\.hm-hero-stats \{[\s\S]*?\n\}/g);
    return m![m!.length - 1]!;
  };

  it('wraps instead of shrinking its cells past their own text', () => {
    expect(phoneBlock()).toMatch(/\.hm-hero-stats \{[^}]*flex-wrap:\s*wrap;/);
  });

  it('a wrapped row is given its own gap, so two rows do not touch', () => {
    expect(phoneBlock()).toMatch(/\.hm-hero-stats \{[^}]*row-gap:\s*\d/);
  });

  it('lifts the nowrap, so a figure too wide for the whole strip breaks inside itself', () => {
    // `.hm-chip-words`' block above sets `white-space: nowrap` on these cells; wrapping the row
    // is tried first, so this only bites when one figure alone cannot fit.
    expect(phoneBlock()).toMatch(/\.hm-hero-stats span \{[^}]*white-space:\s*normal;/);
    expect(phoneBlock()).toMatch(/\.hm-hero-stats span \{[^}]*min-width:\s*0;/);
  });

  it('still fills a row before breaking one, so the usual three stay on one line', () => {
    expect(phoneBlock()).toMatch(/\.hm-hero-stats span \{[^}]*flex:\s*0 1 auto;/);
  });
});

/**
 * Jira GRW-486 — what needs the owner, on the screen the owner holds.
 */
describe("the phone's card order (Jira GRW-486)", () => {
  const owner = code('OwnerHome.tsx');
  const home = code('../../styles/83-role-home.css');
  const at = (cls: string) => owner.indexOf(`hm-area-${cls}`);

  it('"Needs your attention" is no longer laptop-only', () => {
    expect(owner).toMatch(/className="hm-area-attention" title=\{t\.needsYourAttention\}/);
    expect(owner).not.toMatch(/hm-area-attention hm-desktop/);
  });

  it('reads money, shortcuts, queue, what needs you, the day, clients', () => {
    // Shortcuts sit second by the owner's own call (2026-10-04) — Packages, Offers and Free times
    // have no tab, so this grid is how they get into the app.
    const order = ['hero', 'links', 'queue', 'attention', 'bookings', 'clients'].map(at);
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('carries that order in the DOM, not with `order`, so Tab and VoiceOver agree', () => {
    expect(home).not.toMatch(/\.hm-area-(?:hero|attention|queue|links|clients|bookings)\s*\{\s*order:/);
  });

  it('shortcuts are on the phone and nowhere else', () => {
    expect(owner).toMatch(/className="hm-area-links hm-mobile"/);
  });

  it('the laptop grid is untouched: it still places by name', () => {
    expect(home).toMatch(/grid-template-areas:\s*\n?\s*'hero attention'/);
    expect(home).toMatch(/\.hm-area-attention \{\s*grid-area: attention;/);
  });
});

/**
 * Jira GRW-485 — every branch's takings, from the branch line's "+N".
 *
 * The line holds two branches and says "+3" for the rest (GRW-394 keeps it to one row). That
 * "+3" used to open the branch SWITCHER, which answered a question nobody had asked: an owner
 * tapping it on a money line wants to see the other three numbers, not leave the screen.
 *
 * Measured in a browser at 390px and at 344px, with the root at 16, 20 and 23px: the popover
 * is 296–300px wide, fits the screen at every one of them, and never scrolls.
 */
describe('the rest of the branch line', () => {
  const hero = code('MoneyHero.tsx');
  const css = readFileSync(resolve(__dirname, '../../styles/83-role-home.css'), 'utf8');

  it('opens from "+N" as a popover, not as a trip to the picker', () => {
    expect(hero).toMatch(/onMore=\{\(\) => setBranchMenu\(true\)\}/);
    expect(hero).toMatch(/className="hm-menu hm-pay-menu hm-branch-menu" role="dialog"/);
    // The same dismissal the payment popover has: Escape, and a tap outside.
    expect(hero).toMatch(/useDialog\(branchMenuRef, \{ onClose: \(\) => setBranchMenu\(false\)/);
  });

  it('lists every branch, biggest first, with the total above them', () => {
    expect(hero).toMatch(/<BranchMenu t=\{t\} branches=\{branches\} total=\{money\.revenueMinor\}/);
    expect(hero).toMatch(/\.sort\(\(x, y\) => y\.b\.revenueMinor - x\.b\.revenueMinor\)/);
  });

  it('is a list of ways in, so every row is a 44px target', () => {
    expect(css).toMatch(/\.hm-branch-list button \{[^}]*min-height: 44px;/);
    expect(hero).toMatch(/onClick=\{\(\) => onPick\(b\.id\)\}/);
  });

  it('gives way on the name and never on the amount', () => {
    expect(css).toMatch(/\.hm-branch-name \{[^}]*text-overflow: ellipsis;/);
    expect(css).toMatch(/\.hm-branch-list b \{[^}]*flex: none;/);
  });

  it('is sized to its content — a popover that scrolls is a list that should have been a page', () => {
    const block = css.slice(css.indexOf('.hm-branch-list {'), css.indexOf('.hm-branch-menu {') + 120);
    expect(block).not.toMatch(/overflow-y:\s*(auto|scroll)/);
    expect(block).not.toMatch(/max-height/);
  });
});
