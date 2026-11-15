import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { receiptRows, rowsToText } from '../../lib/receipt-text';
import { discountFrom, percentOffMinor, shownPercent } from './bill-discount';

/** Owner, 2026-11-15 — a discount on the whole bill as a % or ₹, on every business's till, named on the receipt. */
describe('what a discount takes off', () => {
  it('10% of ₹380 is ₹38; 15% of ₹999 rounds to the whole rupee (₹150)', () => {
    expect(percentOffMinor(38000, 10)).toBe(3800);
    expect(percentOffMinor(99900, 15)).toBe(15000);
  });

  it('never takes more than the bill, and nothing off nothing', () => {
    expect(percentOffMinor(38000, 100)).toBe(38000);
    expect(percentOffMinor(0, 10)).toBe(0);
  });

  it('refuses an empty value, a percentage over 100, an amount over the bill, and paise', () => {
    expect(discountFrom('pct', '', 38000)).toEqual({ problem: 'empty' });
    expect(discountFrom('pct', '0', 38000)).toEqual({ problem: 'empty' });
    expect(discountFrom('pct', '120', 38000)).toEqual({ problem: 'tooBig' });
    expect(discountFrom('amount', '400', 38000)).toEqual({ problem: 'tooBig' });
    expect(discountFrom('amount', '12.50', 38000)).toEqual({ problem: 'notWhole' });
    expect(discountFrom('amount', '50', 38000)).toEqual({ offMinor: 5000 });
    expect(discountFrom('pct', '12.5', 40000)).toEqual({ offMinor: 5000 });
  });
});

describe('when the % is named', () => {
  it('while the total is what the % gave', () => {
    expect(shownPercent(10, 38000, 34200)).toBe(10);
  });

  it('not once the total changed (a dish added, the total typed over) — then it is just "Discount"', () => {
    expect(shownPercent(10, 48000, 34200)).toBeNull();
    expect(shownPercent(10, 38000, 30000)).toBeNull();
    expect(shownPercent(null, 38000, 34200)).toBeNull();
  });
});

describe('the WhatsApp receipt says the %', () => {
  const copy = {
    title: 'Bill',
    thanks: 'Thanks',
    services: 'Services',
    token: (n: number) => `Token ${n}`,
    stylist: (n: string) => n,
    packageName: (n: string) => n,
    separately: () => '',
    total: (a: string) => `Total: ${a}`,
    discount: (amount: string, pct?: number) => (pct ? `Discount (${pct}%): −${amount}` : `Discount: −${amount}`),
    saved: (a: string) => a,
    paidBy: (m: string) => m,
    seeYou: 'See you',
  };
  const input = {
    businessName: 'County Chicken',
    branchName: null,
    when: '15 Nov',
    tokenNo: 7,
    stylist: null,
    singles: [{ name: 'Chicken Tikka', amountMinor: 38000 }],
    pkg: null,
    totalMinor: 34200,
    adjustMinor: -3800,
    paidBy: 'Cash',
  };
  const money = (m: number) => `₹${m / 100}`;

  it('"Discount (10%): −₹38" when a percentage was given', () => {
    expect(rowsToText(receiptRows({ ...input, discountPct: 10 }, copy, money))).toContain('Discount (10%): −₹38');
  });

  it('"Discount: −₹38" when an amount was', () => {
    const text = rowsToText(receiptRows(input, copy, money));
    expect(text).toContain('Discount: −₹38');
    expect(text).not.toContain('%');
  });
});

describe('every till has the button (owner: every business)', () => {
  const payFlow = readFileSync(new URL('./PayFlow.tsx', import.meta.url), 'utf8');

  it('under the wide till’s total and on the phone’s payment step', () => {
    expect(payFlow.match(/\{discountRow\}/g)?.length).toBe(2);
    expect(payFlow).toContain('{dueLine}\n        {discountRow}');
  });

  it('is not tied to a business type', () => {
    const row = payFlow.slice(payFlow.indexOf('const discountRow ='), payFlow.indexOf('const discountSheet ='));
    expect(row).not.toMatch(/productsOnly|surface|restaurant|salon/);
  });
});
