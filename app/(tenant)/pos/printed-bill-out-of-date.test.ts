import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-736 — fix: QA of the overnight stack (item 7). A coupon typed at the Queue's payment after the table's bill was
 * printed left the paper's QR asking for the old amount, so a guest who scanned it overpaid. The quote now says when the
 * printed bill no longer matches (`printedOutOfDate`); the Queue's payment screen says "The amount changed — print the
 * bill again" and prints it again WITH the coupon or the discount being given, so its total and QR are what is taken.
 */
const pos = readFileSync(resolve(__dirname, 'PosClient.tsx'), 'utf8');
const api = readFileSync(resolve(__dirname, '../lib/api.ts'), 'utf8');
const hook = readFileSync(resolve(__dirname, '../lib/use-bill-offers.ts'), 'utf8');
const printer = readFileSync(resolve(__dirname, '../components/TicketPrinter.tsx'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8'));

describe('the Queue says when the printed bill is out of date, and prints it again with the offer', () => {
  it('reads the quote’s printedOutOfDate, and asks again after a print', () => {
    expect(hook).toContain('printedOutOfDate: Boolean(fresh?.printedOutOfDate),');
    expect(hook).toContain('export function useBillOffers(ask: OffersAsk, again = 0) {');
    expect(pos).toMatch(/useBillOffers\(\{ saleId: token\.id,[^\n]*\}, printedAgain\);/);
  });

  it('shows the sentence and a 44px Print bill only while the paper is out of date', () => {
    expect(pos).toMatch(/\{offers\.printedOutOfDate && !offers\.checking && onPrintAgain \? \(\s*<div className="pf-reprint" role="status">/);
    expect(pos).toContain("{tPay('amountChanged')}");
    expect(pos).toContain("{tPay('amountChangedPrint')}");
  });

  it('prints with the kept coupon, else the discount, else nothing', () => {
    expect(pos).toContain('await onPrintAgain(offers.couponKept && couponCode ? { couponCode } : billOff.offMinor > 0 ? { discountMinor: billOff.offMinor } : {});');
    expect(pos).toContain('onPrintAgain: (held: { couponCode?: string; discountMinor?: number }) => printer.printBill(payingToken.id, true, held)');
    expect(printer).toContain('const issued = await api.issueDocument(saleId, held);');
    expect(api).toMatch(/issueDocument: \(visitKey: string, held\?: \{ couponCode\?: string; discountMinor\?: number \}\) =>\s*post<[^>]*>\(`\/api\/v1\/bills\/\$\{visitKey\}\/document`, held \?\? \{\}\)/);
  });

  it('a waiter is never told to print (a waiter prints no bill)', () => {
    expect(pos).toContain('{...(waiter ? {} : { onPrintAgain:');
  });

  it('says it in English and Hindi', () => {
    expect(en.payFlow.amountChanged).toBe('The amount changed — print the bill again');
    expect(hi.payFlow.amountChanged).toBe('रकम बदल गई — बिल फिर से प्रिंट करें');
    expect(en.payFlow.amountChangedPrint).toBe('Print bill');
    expect(hi.payFlow.amountChangedPrint.length).toBeGreaterThan(3);
  });
});
