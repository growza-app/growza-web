import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-11-16 — "this page UI is very much scattered", then: "we need to have print KOT at the order placement
 * also … and at final i need both print and KOT, remove make receipt".
 */
const done = readFileSync(new URL('./PaymentDone.tsx', import.meta.url), 'utf8');
const share = readFileSync(new URL('./ReceiptShare.tsx', import.meta.url), 'utf8');
const printer = readFileSync(new URL('./TicketPrinter.tsx', import.meta.url), 'utf8');
const payFlow = readFileSync(new URL('../appointments/new/PayFlow.tsx', import.meta.url), 'utf8');
const pos = readFileSync(new URL('../pos/PosClient.tsx', import.meta.url), 'utf8');
const order = readFileSync(new URL('../orders/[id]/OrderClient.tsx', import.meta.url), 'utf8');

describe('Print KOT: when the order is placed, on the paid screen, and on the order screen', () => {
  it('is under the "sent to queue" banner, and on the Queue board after an addition or a cancel', () => {
    expect(payFlow.match(/\{queuedPrint\}/g)).toHaveLength(2);
    expect(pos).toMatch(/\{lastKot \? <TillPrintActions printer=\{printer\} saleId=\{lastKot\.saleId\} kot=\{lastKot\.kot\}/);
    // Jira GRW-733 — every station's slip from the answer (`slipsOf`), the cancel's and the addition's.
    expect(pos).toContain('setLastKot({ saleId: tk.id, kot: cancelled, order });');
    expect(pos).toContain('setLastKot({ saleId: tk.id, kot: added, order });');
    expect(pos.match(/= slipsOf\(res\);/g)).toHaveLength(2);
  });

  it('is on the paid screen — a Queue order reads its tickets from the server', () => {
    expect(pos).toMatch(/<TillPrintActions printer=\{printer\} saleId=\{settledReceipt\.appointmentId\} kitchen=\{orderQueue\}/);
    expect(printer).toMatch(/printer\.printOrderKots\(saleId, false\)/);
  });

  it('and Reprint KOT on the order screen — only while the kitchen still has it to make (owner, 2026-11-16)', () => {
    expect(order).toMatch(/printer\.reprintKots\(order\.id\)/);
    expect(order).toContain('const canReprintKot = !counted && (isCounter || fromApp) && toSend;');
  });

  it('the row reads Print bill, then Print KOT, then the printer', () => {
    const row = printer.slice(printer.indexOf('export function TillPrintActions'));
    expect(row.indexOf("t('printBill')")).toBeLessThan(row.indexOf("t('printKot')"));
    expect(row.indexOf("t('printKot')")).toBeLessThan(row.indexOf('<PrinterButton'));
  });
});

describe('the paid screen of a till that prints is one tidy column', () => {
  it('has no Make receipt: Print bill is the receipt (a salon keeps its button)', () => {
    expect(done).toMatch(/afterSend=\{printSlot \? null : <DocumentAction visitKey=\{appointmentId\} \/>\}/);
  });

  it('prints first, under the amount; the receipt has no second Print', () => {
    expect(done.indexOf('pf-done-print')).toBeLessThan(done.indexOf('<ReceiptShare'));
    expect(done).toMatch(/till=\{Boolean\(printSlot\)\}/);
    expect(share).toMatch(/const canPrint = kind === 'bill' && !till;/);
  });

  it('the number and Send on one row, with no hint under them', () => {
    // Owner, 2026-11-23 — on a till the number and Send come first, under Print, with their own heading; a salon keeps them under the bill.
    expect(share).toContain('<h2 className="wi-section-label wi-send-label">{tv(\'sendBillHeading\')}</h2>');
    expect(share).toContain('<div className="wi-receipt-sendrow">{sendBlock}</div>');
    expect(share).toContain('{till ? null : sendBlock}');
    expect(share).toMatch(/\{till \? null : <p className="wi-receipt-hint">/);
  });

  it('leaves a salon’s done screen as it was (no print row, no till layout)', () => {
    const css = readFileSync(new URL('../styles/99-thermal-print.css', import.meta.url), 'utf8');
    for (const rule of css.match(/\.pf-done[^{]*\{/g) ?? []) expect(rule).toMatch(/is-till|pf-done-print/);
  });
});

describe('the Queue’s Discount waits for the guest, as the till’s does (2026-11-16)', () => {
  it('is not drawn for an anonymous order until "Who is paying?" is skipped (owner, 2026-11-22)', () => {
    // …and never for a waiter (owner decisions 2026-11-15/16; 17 Nov: their payment screen).
    expect(pos).toMatch(/\{waitsForGuest \|\| byNameOnly \? null : \(\s*<button\s+type="button"\s+className=\{`pf-discount-open/);
    expect(pos).toContain('const waitsForGuest = anonymous && !guestSkipped;');
  });
});

describe('the kitchen’s paper is a "kitchen slip", never "KOT" (owner, 2026-11-16: "KOT name is very technical")', () => {
  it('says so in English and Hindi, on the buttons and on the printed slip', () => {
    for (const lang of ['en', 'hi']) {
      const msgs = JSON.parse(readFileSync(new URL(`../../../messages/${lang}.json`, import.meta.url), 'utf8')) as { print: Record<string, string> };
      for (const [key, words] of Object.entries(msgs.print)) expect(`${key}: ${words}`).not.toMatch(/: .*\bKOT\b/);
    }
  });
});

describe('the paid screen on a laptop keeps its two columns in order (owner, 2026-11-22)', () => {
  const css = readFileSync(new URL('../styles/73-pay-flow.css', import.meta.url), 'utf8');
  it('each piece takes the first free cell, so the print row cannot push "The bill", Send and Next guest down', () => {
    // On 1366×768, Next guest had dropped to 749px: below the window.
    expect(css).toMatch(/\.pf-done-page \{[^}]*grid-template-columns: minmax\(0, 1fr\) 22rem;[^}]*grid-auto-flow: row dense;/);
  });
});

describe('the paid screen on a phone (owner, 2026-11-23)', () => {
  const read2 = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const thermal = read2('../styles/99-thermal-print.css');
  const done = read2('./PaymentDone.tsx');
  const share = read2('./ReceiptShare.tsx');
  it('shows the whole bill on a till, asks the number as optional, and has no lone printer icon or unnamed sound icon', () => {
    expect(share).toContain("compactPreview && !till ? 'wi-receipt-paper-short' : ''");
    expect(share).not.toMatch(/label=\{nv\.clientWhatsapp\(clientNoun\)\}\s+required/);
    expect(thermal).toMatch(/@media \(max-width: 759px\) \{\s*\.pf-done-print \.tp-actions-row > \.tp-open \{\s*display: none;/);
    expect(done).toContain('{printSlot ? null : (');
  });
  it('pins Next and Done to the bottom of a phone', () => {
    expect(thermal).toMatch(/\.pf-done-page\.is-till > \.pf-done-actions \{\s*position: fixed;\s*left: 0;\s*right: 0;\s*bottom: 0;/);
  });
});

describe('one Print for the bill and the kitchen slip; WhatsApp first (owner, 2026-11-23)', () => {
  const printer = readFileSync(new URL('./TicketPrinter.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/99-thermal-print.css', import.meta.url), 'utf8');
  const en = JSON.parse(readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8'));
  const hi = JSON.parse(readFileSync(new URL('../../../messages/hi.json', import.meta.url), 'utf8'));

  it('one button prints both; the bill alone, the slip alone and the printer are in its ⋮', () => {
    expect(printer).toContain('onClick={() => void printer.printBillAndKots({ saleId, order, kot, receipt })}');
    expect(printer).toContain("{ label: t('billOnly'), onSelect: printBillOnly },");
    expect(printer).toContain("{ label: t('kotOnly'), onSelect: printKotOnly },");
    expect(printer).toContain("{ label: t('settings'), onSelect: () => setPrinterOpen(true) },");
  });

  it('slips the kitchen already had (an order paid at Pickup, read from the server) print marked REPRINT', () => {
    expect(printer).toContain('kots = await kotJobs(read.tickets, read, true);');
    expect(printer).toContain("const printKotOnly = () => void (kot ? printer.printKot(kot, order) : printer.printOrderKots(saleId, true));");
  });

  it('Send has its word and is never greyed out on a till: with no number a tap asks for one', () => {
    expect(share).toContain('disabled={!till}');
    expect(share).toContain("document.querySelector<HTMLInputElement>('#wi-receipt-phone')?.focus();");
    expect(css).toMatch(/\.wi-receipt-sendrow > \.wi-receipt-send \{[^}]*font-size: var\(--fs-4\);/);
    for (const m of [en, hi]) {
      for (const k of ['printBoth', 'morePrint', 'billOnly', 'kotOnly']) expect(m.print[k], k).toBeTruthy();
      for (const k of ['sendBillHeading', 'sendShort']) expect(m.newVisit[k], k).toBeTruthy();
    }
  });
});
