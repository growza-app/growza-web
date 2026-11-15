import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { orderDiscountMinor } from './order-discount';

const line = (qty: number, price: number, paid: number, swappedFromId: string | null = null) => ({ qty, priceMinor: String(price), paidMinor: String(paid), swappedFromId });

describe('the discount an order screen names (QA 2026-11-15)', () => {
  it('₹240 of food charged ₹200 is ₹40 off', () => {
    expect(orderDiscountMinor([line(1, 18000, 15000), line(2, 3000, 5000)])).toBe(4000);
  });

  it('is what was given at the sale, whatever came back later', () => {
    // 2 Tikka at ₹180, 10% off = ₹324; one came back — the bill still had ₹36 off.
    expect(orderDiscountMinor([line(2, 18000, 32400)])).toBe(3600);
  });

  it('leaves reward points out: they have their own line', () => {
    expect(orderDiscountMinor([line(1, 50000, 47500)], 2500)).toBeNull();
    expect(orderDiscountMinor([line(1, 50000, 42500)], 2500)).toBe(5000);
  });

  it('says nothing when nothing came off, a price was raised, or money is hidden from this viewer', () => {
    expect(orderDiscountMinor([line(1, 18000, 18000)])).toBeNull();
    expect(orderDiscountMinor([line(1, 18000, 20000)])).toBeNull();
    expect(orderDiscountMinor([{ qty: 1, swappedFromId: null }])).toBeNull();
  });

  it('does not count a size swap’s replacement line as a second sale', () => {
    expect(orderDiscountMinor([line(1, 100000, 90000), line(1, 100000, 90000, 'orig')])).toBe(10000);
  });

  it('is on the order screen, in the money block, before the total', () => {
    const src = readFileSync(new URL('../orders/[id]/OrderClient.tsx', import.meta.url), 'utf8');
    const money = src.slice(src.indexOf('className="ord-d-money"'));
    expect(money.indexOf("t('detail.discountGiven')")).toBeGreaterThan(-1);
    expect(money.indexOf("t('detail.discountGiven')")).toBeLessThan(money.indexOf("t('detail.total')"));
  });
});
