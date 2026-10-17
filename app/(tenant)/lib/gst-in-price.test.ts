import { describe, expect, it } from 'vitest';
import { gstInPrice } from './gst-in-price';

/** Jira GRW-582 — "does the price I typed have GST in it, and how much?" */
describe('GST in a price that includes it (the default)', () => {
  it('carves it out: ₹118 at 18% holds ₹18, and the client still pays ₹118', () => {
    expect(gstInPrice(11800, 1800, true)).toEqual({ taxMinor: 1800, totalMinor: 11800 });
  });

  it('is the same arithmetic the invoice does for one line: ₹300 at 18% holds ₹45.76', () => {
    // 300 × 18 ÷ 118 = 45.7627… — the ₹254.24 taxable + ₹45.76 tax the QA invoice printed.
    expect(gstInPrice(30000, 1800, true)).toEqual({ taxMinor: 4576, totalMinor: 30000 });
  });

  it('rounds to the paisa', () => {
    const r = gstInPrice(9999, 500, true)!;
    expect(Number.isInteger(r.taxMinor)).toBe(true);
    expect(r.totalMinor).toBe(9999);
  });
});

describe('GST on a price that excludes it', () => {
  it('adds it on top: ₹100 at 18% is ₹18 more, ₹118 in all', () => {
    expect(gstInPrice(10000, 1800, false)).toEqual({ taxMinor: 1800, totalMinor: 11800 });
  });
});

describe('nothing to say', () => {
  it.each([
    ['no rate', 30000, null],
    ['a 0% rate, which the invoice says itself', 30000, 0],
    ['no price yet', 0, 1800],
    ['a negative price', -100, 1800],
    ['a price that is not a number', Number.NaN, 1800],
  ])('says nothing for %s', (_why, price, rate) => {
    expect(gstInPrice(price, rate, true)).toBeNull();
    expect(gstInPrice(price, rate, false)).toBeNull();
  });
});
