import { ORDER_CHANNEL_WORD } from '@growza-app/shared';
import type { DocumentTicket, KitchenTicketDto } from '../api-types';
import type { BillData, KotData } from './ticket';

/**
 * Jira GRW-713 — what the API answers, turned into what a ticket prints. Pure: every word and every figure's format
 * comes in from the caller, so this is tested without a screen and says the same thing in English and Hindi.
 */

/** Where an order went, as the ticket names it: a delivery app by its name; the counter by nothing (its token says it). */
export function destinationOf(channel: string | null): string | null {
  if (!channel || channel === 'counter') return null;
  return (ORDER_CHANNEL_WORD as Record<string, string>)[channel] ?? null;
}

export function kotFromApi(
  kot: KitchenTicketDto,
  order: { tokenNo: number | null; channel: string | null; branchName?: string | null },
  when: (iso: string) => string,
  reprint = false,
): KotData {
  return {
    number: kot.number,
    kind: kot.kind,
    tokenNo: order.tokenNo,
    destination: destinationOf(order.channel),
    when: when(kot.createdAt),
    items: kot.items.map((i) => ({ name: i.name, qty: i.qty })),
    reprint,
    branchName: order.branchName ?? null,
  };
}

export interface BillWords {
  /** "Tax invoice", from the document type. */
  docTitle: (type: DocumentTicket['docType']) => string;
  /** "Paid by UPI" from the ways it was paid; null when none are known. */
  paidBy: (modes: string[]) => string | null;
  discount: string;
  points: (n: number) => string;
  /**
   * "CGST @2.5%"; `rate` null when the lines carry different rates and no single one can be named. `included` when
   * the menu's prices already hold the tax: the line then says so, or a reader adds it to the sub total twice.
   */
  tax: (name: 'CGST' | 'SGST' | 'IGST', rate: number | null, included: boolean) => string;
}

export interface BillFormat {
  /** A figure in the item table and the totals: "1,196.00", no currency sign. */
  figure: (minor: number) => string;
  /** The grand total, with its sign: "₹1,256.00". */
  money: (minor: number) => string;
  /** The instant as the bill dates it: "13/11/26 20:59". */
  when: (iso: string) => string;
}

/** A walk-in is no name at all on a bill: the line stays for the pen, as the owner's sample has it. */
function guestName(name: string): string | null {
  const n = name.trim();
  return n && n.toLowerCase() !== 'walk-in' ? n : null;
}

/** The one tax rate every line shares, in percent, halved for CGST and SGST; null when the lines differ. */
function sharedRate(doc: DocumentTicket, half: boolean): number | null {
  const rates = new Set(doc.lines.map((l) => l.rateBps).filter((r): r is number => r !== null));
  if (rates.size !== 1) return null;
  const bps = [...rates][0]!;
  return (half ? bps / 2 : bps) / 100;
}

/** An issued document as the roll prints it. Every figure is the document's own; nothing is recomputed here. */
export function billFromDocument(doc: DocumentTicket, words: BillWords, fmt: BillFormat, reprint = false): BillData {
  const adjustments: { label: string; amount: string }[] = [];
  if (doc.discountMinor > 0) {
    adjustments.push({ label: doc.rewardPointsUsed > 0 ? words.points(doc.rewardPointsUsed) : words.discount, amount: `-${fmt.figure(doc.discountMinor)}` });
  }
  const taxMinor = doc.cgstMinor + doc.sgstMinor + doc.igstMinor;
  // Prices that include tax: what was charged is the sub total less the discount, and the tax is inside it.
  const included = taxMinor > 0 && doc.taxableMinor + taxMinor === doc.subTotalMinor - doc.discountMinor;
  if (doc.cgstMinor > 0) adjustments.push({ label: words.tax('CGST', sharedRate(doc, true), included), amount: fmt.figure(doc.cgstMinor) });
  if (doc.sgstMinor > 0) adjustments.push({ label: words.tax('SGST', sharedRate(doc, true), included), amount: fmt.figure(doc.sgstMinor) });
  if (doc.igstMinor > 0) adjustments.push({ label: words.tax('IGST', sharedRate(doc, false), included), amount: fmt.figure(doc.igstMinor) });
  const ro = doc.roundOffMinor;
  return {
    businessName: doc.supplier.tradeName || doc.supplier.legalName,
    legalName: doc.supplier.legalName,
    address: doc.supplier.address,
    phone: doc.supplier.phone,
    gstin: doc.supplier.gstin,
    fssai: doc.supplier.fssai,
    docTitle: words.docTitle(doc.docType),
    customerName: guestName(doc.customerName),
    when: fmt.when(doc.issuedAt),
    orderLabel: destinationOf(doc.channel),
    cashier: doc.cashierName,
    number: doc.number,
    tokenNo: doc.tokenNo,
    items: doc.lines.map((l) => ({
      name: l.description,
      qty: l.qty,
      price: fmt.figure(l.unitPriceMinor),
      // The API's own line amount: unit × qty is off by paise where a line does not divide by its quantity.
      amount: fmt.figure(l.amountMinor),
    })),
    totalQty: doc.lines.reduce((n, l) => n + l.qty, 0),
    subTotal: fmt.figure(doc.subTotalMinor),
    adjustments,
    roundOff: ro === 0 ? null : `${ro > 0 ? '+' : '-'}${fmt.figure(Math.abs(ro))}`,
    grandTotal: fmt.money(doc.grandTotalMinor),
    paidBy: words.paidBy(doc.paymentModes),
    footer: doc.supplier.footer,
    reprint,
  };
}
