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

  it('the branch line is for All branches on the Today tab only, because its amounts are today\'s', () => {
    expect(hero).toMatch(/branches\.length > 1 && branchId === null && money\.period === 'today'/);
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

  it('says which branch, offers the way out, and keeps it through the date form', () => {
    expect(list).toMatch(/copy\.bookings\.branchOnly\(branch\.name\)/);
    expect(list).toMatch(/copy\.bookings\.branchClear/);
    expect(list).toMatch(/name="location" value=\{branch\.id\}/);
  });

  it('shows no "busy" figure for one branch while the capacity is the whole business\'s', () => {
    expect(list).toMatch(/capacityMin > 0 && !branch \? Math\.round/);
  });
});
