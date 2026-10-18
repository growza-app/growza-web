import { describe, expect, it } from 'vitest';
import { gstInPrice } from './gst-in-price';

/** Jira GRW-582 — "does the price I typed have GST in it, and how much?" Prices always include GST. */
describe('GST in a price', () => {
  it('carves it out: ₹118 at 18% holds ₹18', () => {
    expect(gstInPrice(11800, 1800)).toEqual({ taxMinor: 1800 });
  });

  it('is the same arithmetic the invoice does for one line: ₹300 at 18% holds ₹45.76', () => {
    // 300 × 18 ÷ 118 = 45.7627… — the ₹254.24 taxable + ₹45.76 tax the QA invoice printed.
    expect(gstInPrice(30000, 1800)).toEqual({ taxMinor: 4576 });
  });

  it('rounds to the paisa', () => {
    expect(Number.isInteger(gstInPrice(9999, 500)!.taxMinor)).toBe(true);
  });

  it('never adds to the price: there is no "plus GST" mode, because the till never charges one', () => {
    // The function returns only the tax inside the price. A total larger than the price would be a promise the till
    // does not keep — the reason the "prices exclude GST" switch was removed.
    expect(Object.keys(gstInPrice(10000, 1800)!)).toEqual(['taxMinor']);
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
    expect(gstInPrice(price, rate)).toBeNull();
  });
});
