import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatStructuredWhatsappText, receiptRows, type ReceiptCopy, type ReceiptInput } from './receipt-text';

/**
 * QA 2026-10-28, driving real redemptions against the till.
 *
 * The receipt told a customer "You have 12 points. That is ₹12 off your next bill" while the till would
 * honour NOTHING: 8 of the 12 were still inside the business's hold and the other 4 were under a floor of
 * 25. The client card said the same thing in its own words — "Worth ₹75 off a bill" for someone the till
 * would give ₹30.
 *
 * `balanceAfter` is what a person HAS. It counts held points and knows nothing about the floor. A receipt
 * built from it promises money the till refuses, and the customer is holding our message while that
 * argument happens at the counter.
 */
const money = (m: number) => `₹${(m / 100).toLocaleString('en-IN')}`;
const copy = {
  title: 'Payment receipt', thanks: 'Thank you.', services: 'Your order',
  token: (n: number) => `#${n}`, stylist: (n: string) => n, packageName: (t: string) => t,
  separately: (w: string, s: string) => `${w} ${s}`, total: (a: string) => `Total paid: ${a}`,
  saved: (a: string) => a, paidBy: (m: string) => `Paid by ${m}`, seeYou: '',
  rewardsTitle: 'Rewards',
  rewardEarned: (p: number) => `You earned ${p} points.`,
  rewardBalance: (p: number, w: string | null) => (w ? `You have ${p} points. That is ${w} off your next bill.` : `You have ${p} points.`),
} as unknown as ReceiptCopy;

const text = (rewards: Record<string, number>) =>
  formatStructuredWhatsappText(
    receiptRows(
      {
        businessName: 'County Chicken', branchName: null, when: '28 Oct 2026, 2:05 pm', tokenNo: null, stylist: null,
        singles: [{ name: 'Roasted Chicken (Full)', amountMinor: 43000 }], pkg: null, totalMinor: 43000, paidBy: 'Cash',
        rewards: { earnedPoints: 4, redeemedPoints: 0, discountMinor: 0, ...rewards },
      } as unknown as ReceiptInput,
      copy,
      money,
    ),
  );

describe('the receipt promises only what the till will pay', () => {
  it('prices the balance when every point of it can be spent', () => {
    const t = text({ balancePoints: 40, spendableAfter: 40, minRedeemPoints: 25, pointValueMinor: 100 });
    expect(t).toContain('You have 40 points. That is ₹40 off your next bill.');
  });

  /* The exact case found at the till: 12 points, 8 of them held, a floor of 25. The till honours nothing. */
  it('says the points alone when the hold and the floor leave nothing spendable', () => {
    const t = text({ balancePoints: 12, spendableAfter: 4, minRedeemPoints: 25, pointValueMinor: 100 });
    expect(t).toContain('You have 12 points.');
    expect(t).not.toContain('That is');
    expect(t).not.toContain('₹12 off');
  });

  it('prices the SPENDABLE part, never the held part', () => {
    // 75 points, 45 of them held: the till gives ₹30, so the receipt says ₹30 — not ₹75.
    const t = text({ balancePoints: 75, spendableAfter: 30, minRedeemPoints: 25, pointValueMinor: 100 });
    expect(t).toContain('That is ₹30 off your next bill.');
    expect(t).not.toContain('₹75 off');
  });

  it('is silent about money when the spendable part is under the floor', () => {
    const t = text({ balancePoints: 60, spendableAfter: 24, minRedeemPoints: 25, pointValueMinor: 100 });
    expect(t).toContain('You have 60 points.');
    expect(t).not.toContain('That is');
  });

  it('falls back to the balance for an API that cannot say what is spendable', () => {
    const t = text({ balancePoints: 40, minRedeemPoints: 25, pointValueMinor: 100 });
    expect(t).toContain('That is ₹40 off your next bill.');
  });
});

describe('the client card does the same arithmetic', () => {
  const card = readFileSync(join(process.cwd(), 'app/(tenant)/components/ClientProfileCard.tsx'), 'utf8');

  it('takes the hold off the balance before pricing it', () => {
    expect(card).toContain('Math.max(0, rewards.balance - rewards.heldPoints)');
    expect(card).not.toContain('rewards.balance * rewards.pointValueMinor');
  });

  it('says how many more are needed rather than "Worth ₹0"', () => {
    expect(card).toContain('c.pointsNeedMore(rewards.minRedeemPoints - spendable)');
  });

  it('says plainly that the held ones are not ready', () => {
    expect(card).toContain('rewards.heldPoints > 0 && <em>{c.pointsHeld(rewards.heldPoints)}</em>');
  });
});
