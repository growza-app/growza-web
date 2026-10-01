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
    expect(homeCopy('en').notMarkedPill(2)).toBe('2 not marked done');
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

  it('the pill only appears when something needs marking, and links with the branch', () => {
    expect(hero).toMatch(/notMarked > 0 && unmarkedHref/);
    expect(code('OwnerHome.tsx')).toMatch(/unmarked=1\$\{branch \? `&location=\$\{encodeURIComponent\(branch\)\}` : ''\}/);
    expect(code('OwnerHome.tsx')).toMatch(/href: unmarkedHref/);
  });

  it('the branch line is for All branches on every tab, its amounts being the period\'s (GRW-313)', () => {
    expect(hero).toMatch(/branches\.length > 1 && branchId === null && Boolean\(onPickBranch && onMoreBranches\)/);
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

  it('shows no "busy" figure for one branch while the capacity is the whole business\'s', () => {
    expect(list).toMatch(/capacityMin > 0 && !branch \? Math\.round/);
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
