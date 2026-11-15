import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Owner, 2026-11-16 — "this page UI is very much scattered, and print KOT should be visible at the final page only and inside the orders". */
const done = readFileSync(new URL('./PaymentDone.tsx', import.meta.url), 'utf8');
const share = readFileSync(new URL('./ReceiptShare.tsx', import.meta.url), 'utf8');
const printer = readFileSync(new URL('./TicketPrinter.tsx', import.meta.url), 'utf8');
const payFlow = readFileSync(new URL('../appointments/new/PayFlow.tsx', import.meta.url), 'utf8');
const pos = readFileSync(new URL('../pos/PosClient.tsx', import.meta.url), 'utf8');
const order = readFileSync(new URL('../orders/[id]/OrderClient.tsx', import.meta.url), 'utf8');

describe('Print KOT: on the paid screen and the order screen only', () => {
  it('is not under the "sent to queue" banner, nor on the Queue board', () => {
    expect(payFlow).not.toContain('queuedPrint');
    expect(pos).not.toContain('lastKot');
  });

  it('is on the paid screen — a Queue order reads its tickets from the server', () => {
    expect(pos).toMatch(/<TillPrintActions printer=\{printer\} saleId=\{settledReceipt\.appointmentId\} kitchen=\{orderQueue\}/);
    expect(printer).toMatch(/printer\.printOrderKots\(saleId, false\)/);
  });

  it('and Reprint KOT on the order screen', () => {
    expect(order).toMatch(/printer\.reprintKots\(order\.id\)/);
  });

  it('the row reads Print bill, then Print KOT, then the printer', () => {
    const row = printer.slice(printer.indexOf('export function TillPrintActions'));
    expect(row.indexOf("t('printBill')")).toBeLessThan(row.indexOf("t('printKot')"));
    expect(row.indexOf("t('printKot')")).toBeLessThan(row.indexOf('<PrinterButton'));
  });
});

describe('the paid screen of a till that prints is one tidy column', () => {
  it('prints first, under the amount; the receipt has no second Print', () => {
    expect(done.indexOf('pf-done-print')).toBeLessThan(done.indexOf('<ReceiptShare'));
    expect(done).toMatch(/till=\{Boolean\(printSlot\)\}/);
    expect(share).toMatch(/const canPrint = kind === 'bill' && !till;/);
  });

  it('the number and Send on one row, with no hint under them', () => {
    expect(share).toMatch(/\{till \? <div className="wi-receipt-sendrow">\{sendBlock\}<\/div> : sendBlock\}/);
    expect(share).toMatch(/\{till \? null : <p className="wi-receipt-hint">/);
  });

  it('leaves a salon’s done screen as it was (no print row, no till layout)', () => {
    const css = readFileSync(new URL('../styles/99-thermal-print.css', import.meta.url), 'utf8');
    for (const rule of css.match(/\.pf-done[^{]*\{/g) ?? []) expect(rule).toMatch(/is-till|pf-done-print/);
  });
});

describe('the Queue’s Discount waits for the guest, as the till’s does (2026-11-16)', () => {
  it('is not drawn for an anonymous order', () => {
    expect(pos).toMatch(/\{anonymous \? null : \(\s*<button\s+type="button"\s+className=\{`pf-discount-open/);
  });
});
