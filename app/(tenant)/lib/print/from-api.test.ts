import { describe, expect, it } from 'vitest';
import type { DocumentTicket } from '../api-types';
import { billFromDocument, destinationOf, kotFromApi, type BillFormat, type BillWords } from './from-api';

const words: BillWords = {
  docTitle: (type) => ({ tax_invoice: 'Tax invoice', bill_of_supply: 'Bill of supply', receipt: 'Receipt' })[type],
  paidBy: (ways) => (ways.length ? `Pay mode: ${ways.map((w) => (w.amount ? `${w.mode} ${w.amount}` : w.mode)).join(' · ')}` : null),
  discount: 'Discount',
  points: (n) => `Reward points (${n})`,
  tax: (name, rate, included) => (rate === null ? name : `${name} @${rate}%${included ? ' (incl.)' : ''}`),
};

const fmt: BillFormat = {
  figure: (m) => (m / 100).toFixed(2),
  money: (m) => `₹${(m / 100).toFixed(2)}`,
  when: () => '13/11/26 20:59',
};

/** The owner's sample bill, as the API would answer it: prices before tax, 5% GST on top, 20 paise rounded up. */
const sampleDoc = (over: Partial<DocumentTicket> = {}): DocumentTicket => ({
  id: 'd1',
  docType: 'tax_invoice',
  number: '8901',
  issuedAt: '2026-11-13T15:29:00.000Z',
  status: 'issued',
  supplier: { legalName: 'Brew Haven LLP', tradeName: 'The Brew Haven', address: 'SH-01, Cantt', gstin: '09ABFFB3084R1ZT', phone: '9286826415', fssai: '12726009000135', footer: 'Tag us' },
  customerName: 'Walk-in',
  cashierName: 'admin',
  lines: [
    { description: 'Cappuccino (Bean 1)', qty: 2, unitPriceMinor: 20900, amountMinor: 41800, discountMinor: 0, totalMinor: 43890, rateBps: 500 },
    { description: 'Alfredo Sauce Pasta', qty: 1, unitPriceMinor: 39900, amountMinor: 39900, discountMinor: 0, totalMinor: 41895, rateBps: 500 },
    { description: 'Grilled Paneer & Rice In Brown Sauce', qty: 1, unitPriceMinor: 37900, amountMinor: 37900, discountMinor: 0, totalMinor: 39795, rateBps: 500 },
  ],
  subTotalMinor: 119600,
  discountMinor: 0,
  taxableMinor: 119600,
  cgstMinor: 2990,
  sgstMinor: 2990,
  igstMinor: 0,
  roundOffMinor: 20,
  grandTotalMinor: 125600,
  rewardPointsUsed: 0,
  paymentModes: ['upi'],
  tokenNo: 14,
  channel: 'counter',
  ...over,
});

describe('an issued document, as the roll prints it', () => {
  it('carries the document’s own figures, line by line, the way the sample reads', () => {
    const b = billFromDocument(sampleDoc(), words, fmt);
    expect(b.items.map((i) => [i.name, i.qty, i.price, i.amount])).toEqual([
      ['Cappuccino (Bean 1)', 2, '209.00', '418.00'],
      ['Alfredo Sauce Pasta', 1, '399.00', '399.00'],
      ['Grilled Paneer & Rice In Brown Sauce', 1, '379.00', '379.00'],
    ]);
    expect(b.totalQty).toBe(4);
    expect(b.subTotal).toBe('1196.00');
    expect(b.adjustments).toEqual([
      { label: 'CGST @2.5%', amount: '29.90' },
      { label: 'SGST @2.5%', amount: '29.90' },
    ]);
    expect(b.roundOff).toBe('+0.20');
    expect(b.grandTotal).toBe('₹1256.00');
    expect(b).toMatchObject({ businessName: 'The Brew Haven', gstin: '09ABFFB3084R1ZT', number: '8901', cashier: 'admin', docTitle: 'Tax invoice', paidBy: 'Pay mode: upi ₹1256.00', fssai: '12726009000135' });
  });

  it('prints what came in each way when the bill was split, the HSN code, and the amount in words (owner’s samples, 16 Nov 2026)', () => {
    const doc = sampleDoc({
      paymentModes: ['upi', 'cash'],
      payments: [
        { mode: 'upi', amountMinor: 100000 },
        { mode: 'cash', amountMinor: 25600 },
      ],
      amountInWords: 'Rupees One Thousand Two Hundred Fifty Six Only',
      lines: [{ description: 'Kulhad Tea', hsnOrSac: '996332', qty: 1, unitPriceMinor: 2500, amountMinor: 2500, discountMinor: 0, totalMinor: 2625, rateBps: 500 }],
    });
    const b = billFromDocument(doc, words, fmt);
    expect(b.paidBy).toBe('Pay mode: upi ₹1000.00 · cash ₹256.00');
    expect(b.amountInWords).toBe('Rupees One Thousand Two Hundred Fifty Six Only');
    expect(b.items[0]).toMatchObject({ name: 'Kulhad Tea', hsn: '996332' });
  });

  it('names no amount beside each way when an older API sent the ways alone and there were two', () => {
    expect(billFromDocument(sampleDoc({ paymentModes: ['upi', 'cash'] }), words, fmt).paidBy).toBe('Pay mode: upi · cash');
  });

  it('leaves a walk-in’s name for the pen, and prints a named guest', () => {
    expect(billFromDocument(sampleDoc(), words, fmt).customerName).toBeNull();
    expect(billFromDocument(sampleDoc({ customerName: 'Priya Nair' }), words, fmt).customerName).toBe('Priya Nair');
  });

  it('says the tax is included when the menu’s prices already hold it, so nobody adds it twice', () => {
    // ₹1,196 charged, tax carved out of it: taxable + tax = what was charged.
    const inclusive = sampleDoc({ taxableMinor: 113904, cgstMinor: 2848, sgstMinor: 2848, roundOffMinor: 0, grandTotalMinor: 119600 });
    expect(billFromDocument(inclusive, words, fmt).adjustments.map((a) => a.label)).toEqual(['CGST @2.5% (incl.)', 'SGST @2.5% (incl.)']);
  });

  it('names a rate only when every line has the same one', () => {
    const mixed = sampleDoc({ lines: [{ ...sampleDoc().lines[0]!, rateBps: 500 }, { ...sampleDoc().lines[1]!, rateBps: 1800 }] });
    expect(billFromDocument(mixed, words, fmt).adjustments.map((a) => a.label)).toEqual(['CGST', 'SGST']);
  });

  it('names reward points as the discount they were, and prints no round-off line when nothing rounded', () => {
    const b = billFromDocument(sampleDoc({ discountMinor: 2500, rewardPointsUsed: 25, roundOffMinor: 0 }), words, fmt);
    expect(b.adjustments[0]).toEqual({ label: 'Reward points (25)', amount: '-25.00' });
    expect(b.roundOff).toBeNull();
  });
});

describe('a line that does not divide by its quantity (review finding 3)', () => {
  it('prints the line’s own amount, so the lines add up to the sub total', () => {
    const doc = sampleDoc({
      lines: [{ description: 'Veg Thali', qty: 3, unitPriceMinor: 3333, amountMinor: 10000, discountMinor: 0, totalMinor: 10000, rateBps: null }],
      subTotalMinor: 10000,
      taxableMinor: 10000,
      cgstMinor: 0,
      sgstMinor: 0,
      roundOffMinor: 0,
      grandTotalMinor: 10000,
    });
    expect(billFromDocument(doc, words, fmt).items[0]).toMatchObject({ price: '33.33', amount: '100.00' });
  });
});

describe('where the order went', () => {
  it('names a delivery app, and nothing for the counter (its token says it)', () => {
    expect(destinationOf('swiggy')).toBe('Swiggy');
    expect(destinationOf('counter')).toBeNull();
    expect(destinationOf(null)).toBeNull();
  });

  it('a KOT carries the order’s token and the time it was made', () => {
    const k = kotFromApi(
      { id: 'k1', number: 7, kind: 'add', createdAt: '2026-11-14T15:10:00.000Z', items: [{ name: 'Sweet Lassi', qty: 1 }] },
      { tokenNo: 14, channel: 'zomato' },
      () => '14 Nov, 8:40 pm',
      true,
    );
    expect(k).toMatchObject({ number: 7, kind: 'add', tokenNo: 14, destination: 'Zomato', when: '14 Nov, 8:40 pm', reprint: true });
  });
});
