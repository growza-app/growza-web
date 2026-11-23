import { describe, expect, it } from 'vitest';
import { encodeTicket, type Rasterize } from './escpos';
import { DEFAULT_PRINTER } from './printer';
import { encodeQr, qrBitmap } from './qr';
import { ticketHtml } from './ticket-html';
import { billTicket, type BillCopy, type BillData } from './ticket';
import { isUpiId } from '../../settings/payments/UpiIdCard';

/** Jira GRW-729 — the UPI QR printed on the bill: under the total, "Scan to pay ₹540" under it, PAID in its place once paid. */
const copy: BillCopy = {
  reprint: 'REPRINT', phone: (v) => v, gstin: (v) => v, fssai: (v) => v, name: (v) => `Name: ${v}`, date: (v) => `Date: ${v}`,
  cashier: (v) => `Cashier: ${v}`, billNo: (v) => `Bill No.: ${v}`, token: (n) => `Token #${n}`, colItem: 'Item', colQty: 'Qty.',
  colPrice: 'Price', colAmount: 'Amount', totalQty: (n) => `Total Qty: ${n}`, subTotal: 'Sub Total', roundOff: 'Round off',
  grandTotal: 'Grand Total', thanks: 'Thank you',
};
const bill = (over: Partial<BillData> = {}): BillData => ({
  businessName: 'Spice Garden', docTitle: 'Tax invoice', customerName: null, when: '18/11/26 20:15', orderLabel: 'Dine-in · T5', cashier: 'Pooja',
  number: 'SG/0042', tokenNo: null, items: [{ name: 'Butter Chicken', qty: 2, price: '220.00', amount: '440.00' }, { name: 'Garlic Naan', qty: 2, price: '50.00', amount: '100.00' }],
  totalQty: 4, subTotal: '540.00', adjustments: [], roundOff: null, grandTotal: '₹540.00', paidBy: null, footer: 'See you soon', ...over,
});
const noRaster: Rasterize = (_l, w) => ({ width: w, height: 1, bits: new Uint8Array(w / 8) });
const qr = qrBitmap(encodeQr('upi://pay?pa=spicegarden%40okicici&pn=Spice%20Garden&am=540.00&cu=INR&tn=SG%2F0042'), 384);

describe('the QR on the bill (FR-01, FR-03)', () => {
  it('sits under the grand total, with "Scan to pay ₹540" under it, before the business’s own line', () => {
    const lines = billTicket(bill({ payQr: { bitmap: qr, caption: 'Scan to pay ₹540' } }), copy).lines;
    const total = lines.findIndex((l) => l.kind === 'text' && l.text.startsWith('Grand Total'));
    const image = lines.findIndex((l) => l.kind === 'image');
    expect(image).toBeGreaterThan(total);
    expect(lines[image + 1]).toMatchObject({ kind: 'text', text: 'Scan to pay ₹540', align: 'center' });
    expect(lines.findIndex((l) => l.kind === 'text' && l.text === 'See you soon')).toBeGreaterThan(image);
  });

  it('goes to a Bluetooth printer as one raster as wide as the roll; the dialog shows it as a picture', () => {
    const t = billTicket(bill({ payQr: { bitmap: qr, caption: 'Scan to pay ₹540' } }), copy);
    const bytes = encodeTicket(t, '58', noRaster);
    const at = bytes.findIndex((b, i) => b === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30);
    expect(bytes[at + 4]! | (bytes[at + 5]! << 8)).toBe(48);
    expect(bytes[at + 6]! | (bytes[at + 7]! << 8)).toBe(qr.height);
    expect(String.fromCharCode(...bytes)).toContain('Scan to pay Rs.540');
    expect(ticketHtml(t)).toContain('<img class="tp-image" src="data:image/bmp;base64,');
  });
});

describe('BR-01 — a paid bill says PAID and prints no QR', () => {
  it('PAID, big and centred, and no picture', () => {
    const lines = billTicket(bill({ paidStamp: 'PAID', paidBy: 'Paid by UPI ₹540' }), copy).lines;
    expect(lines.some((l) => l.kind === 'image')).toBe(false);
    expect(lines).toContainEqual({ kind: 'text', text: 'PAID', align: 'center', bold: true, size: 2 });
  });

  it('PAID wins over a QR handed in by mistake', () => {
    const lines = billTicket(bill({ paidStamp: 'PAID', payQr: { bitmap: qr, caption: 'Scan to pay ₹540' } }), copy).lines;
    expect(lines.some((l) => l.kind === 'image')).toBe(false);
  });
});

describe('AC-03 — no QR set up: the bill prints exactly as before', () => {
  it('the same lines, the same bytes', () => {
    expect(billTicket(bill({ payQr: null, paidStamp: null }), copy)).toEqual(billTicket(bill(), copy));
    expect(encodeTicket(billTicket(bill({ payQr: null }), copy), '80', noRaster)).toEqual(encodeTicket(billTicket(bill(), copy), '80', noRaster));
  });
});

describe('the counter’s own switch, and the UPI ID’s shape (BR-02)', () => {
  it('"Print the payment QR on the bill" is on by default', () => {
    expect(DEFAULT_PRINTER.billQr).toBe(true);
  });

  it('name@bank passes; anything else is refused', () => {
    for (const ok of ['shopname@okicici', '98765.43210@ybl', 'spice-garden_1@oksbi', ' Spice@Paytm ']) expect(isUpiId(ok), ok).toBe(true);
    for (const bad of ['', 'shopname', '@okicici', 'shop@', 'shop name@okicici', 'shop@ok icici', 'shop@@okicici', 'shop@1bank', 'https://pay.me']) expect(isUpiId(bad), bad).toBe(false);
  });
});
