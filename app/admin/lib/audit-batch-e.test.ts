import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { amountToRecord } from '../components/RecordPaymentModal';
import { billingToday, canKeepWindow, discountPreview, keepFallbackMonths } from '../components/DiscountModal';

/**
 * Admin portal audit, batch E (2026-10-09) — the money the billing screens show and act on.
 *
 * The two pure functions run for real against the API's own arithmetic (billing/pricing.ts `billFor`, dunning.ts
 * `stillOwedMinor`); the screens are source-reading, as elsewhere in this suite.
 */
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

// A real-shaped salon: ₹799 base, two extra branches at ₹299 each.
const BASE = 79900;
const BRANCHES = 2 * 29900;

describe('M3 — Record a payment prefills what is actually owed', () => {
  it('what is owed now wins — every unpaid bill, branches and earlier months included', () => {
    expect(amountToRecord({ id: 's', finalPriceMinor: BASE, owedMinor: 139700, nextBill: { finalPriceMinor: BASE + BRANCHES } })).toEqual({
      minor: 139700,
      owedNow: true,
      nextBillMinor: BASE + BRANCHES,
    });
  });

  it('with nothing owed, the next bill — branches included, not the base price', () => {
    expect(amountToRecord({ id: 's', finalPriceMinor: BASE, owedMinor: 0, nextBill: { finalPriceMinor: BASE + BRANCHES } }).minor).toBe(BASE + BRANCHES);
  });

  it('an API older than batch E still gets the old figure, not a blank', () => {
    expect(amountToRecord({ id: 's', finalPriceMinor: BASE }).minor).toBe(BASE);
  });

  it('the dialog seeds from it and says which it is', () => {
    const src = read('components/RecordPaymentModal.tsx');
    expect(src).toMatch(/setAmount\(String\(amountToRecord\(subscription\)\.minor \/ 100\)\);/);
    expect(src).toMatch(/\{owedNow \? 'Owed now' : 'Their next bill'\}/);
    expect(src).not.toMatch(/What they are charged/);
  });
});

describe('M4 — the discount preview is what the bill will say', () => {
  it('a percent applies to base AND branches', () => {
    const p = discountPreview('percent', 10, BASE, BRANCHES);
    expect(p.listMinor).toBe(139700);
    expect(p.discountMinor).toBe(13970); // 10% of ₹1,397, not of ₹799
    expect(p.finalMinor).toBe(125730);
  });

  it('a final price is the base price; branches still come on top', () => {
    const p = discountPreview('final', 500, BASE, BRANCHES);
    expect(p.storedMinor).toBe(29900); // ₹799 − ₹500, what the API stores
    expect(p.finalMinor).toBe(50000 + BRANCHES);
  });

  it('a fixed amount comes off the whole', () => {
    expect(discountPreview('fixed', 200, BASE, BRANCHES).finalMinor).toBe(BASE + BRANCHES - 20000);
  });

  it('with no branches it is exactly what it always was', () => {
    expect(discountPreview('fixed', 200, BASE, 0)).toMatchObject({ discountMinor: 20000, finalMinor: 59900, outOfRange: false });
  });

  it('out of range is judged against the base price, as the API refuses it', () => {
    expect(discountPreview('fixed', 900, BASE, BRANCHES).outOfRange).toBe(true);
    expect(discountPreview('final', 900, BASE, BRANCHES).outOfRange).toBe(true);
  });

  it('the dialog uses it and shows the branches line', () => {
    const src = read('components/DiscountModal.tsx');
    expect(src).toMatch(/discountPreview\(type, Number\(value\) \|\| 0, subscription\?\.listPriceMinor \?\? 0, branchAmountMinor\)/);
    expect(src).toMatch(/\{branchAmountMinor > 0 \? <Row label="Extra branches"/);
  });
});

describe('M5 — Reactivate / Resume cannot be sent as a no-op', () => {
  const modal = read('components/ReenrolModal.tsx');
  it('is refused while money is owed and no payment is being recorded — Re-enrol is not', () => {
    expect(modal).toMatch(/const settlesFirst = !!preview && preview\.action !== 'reenrol' && preview\.outstandingMinor > 0;/);
    expect(modal).toMatch(/: !withPayment && settlesFirst\s*\?/);
  });
  it('the panel says "Recorded" only when a payment was', () => {
    const panel = read('components/SubscriptionPanel.tsx');
    expect(panel).toMatch(/: result\.payment\s*\?\s*`Recorded, but/);
    expect(panel).toMatch(/: `Nothing changed — \$\{formatMoneyMinor\(result\.outstandingMinor\)\} is still owed/);
  });
});

describe('M6 — editing a discount keeps its window', () => {
  const src = read('components/DiscountModal.tsx');
  it('an existing discount opens on "Keep", and sends keepWindow', () => {
    expect(src).toMatch(/setDuration\(canKeepWindow\(currentDiscount, billingToday\(\)\) \? 'keep' : '6'\);/);
    expect(src).toMatch(
      /currentDiscount && canKeepWindow\(currentDiscount, billingToday\(\)\) \? \(\s*<option value="keep">\s*\{currentDiscount\.endsAt \? `Keep — ends \$\{formatDateOnly\(currentDiscount\.endsAt\)\}` : 'Keep — permanent'\}/,
    );
    expect(src).toMatch(/keepWindow: duration === 'keep',/);
    // Review fix — never null for a timed discount: an API without keepWindow reads null as permanent.
    expect(src).toMatch(/duration === 'keep' \? keepFallbackMonths\(currentDiscount\?\.endsAt \?\? null, billingToday\(\)\) : duration === '0' \? null : Number\(duration\),/);
  });
  it('the other lengths say they restart from today', () => {
    expect(src).toMatch(/\{currentDiscount \? '6 months from today' : '6 months'\}/);
  });
});

describe('review fixes — Keep is safe on an older API, and never offered for an ended window', () => {
  it('billingToday is the IST date, not UTC', () => {
    // 20:00 UTC on the 9th is 01:30 on the 10th in India.
    expect(billingToday(new Date('2026-10-09T20:00:00Z'))).toBe('2026-10-10');
  });

  it('a window ending today or earlier cannot be kept (the sweep expires it today); later or permanent can', () => {
    expect(canKeepWindow({ endsAt: '2026-10-09' }, '2026-10-10')).toBe(false);
    expect(canKeepWindow({ endsAt: '2026-10-10' }, '2026-10-10')).toBe(false);
    expect(canKeepWindow({ endsAt: '2026-10-11' }, '2026-10-10')).toBe(true);
    expect(canKeepWindow({ endsAt: null }, '2026-10-10')).toBe(true);
    expect(canKeepWindow(null, '2026-10-10')).toBe(false);
  });

  it('the fallback duration ends within the same month on an older API, and is null only for a permanent one', () => {
    expect(keepFallbackMonths(null, '2026-10-10')).toBeNull();
    expect(keepFallbackMonths('2027-04-10', '2026-10-10')).toBe(6);
    expect(keepFallbackMonths('2027-04-11', '2026-10-10')).toBe(7);
    expect(keepFallbackMonths('2026-10-20', '2026-10-10')).toBe(1);
    expect(keepFallbackMonths('2099-01-01', '2026-10-10')).toBe(240);
  });
});
