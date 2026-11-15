/**
 * Jira GRW-713 — what a thermal printer prints, as plain lines, before anyone decides HOW it is printed.
 *
 * A KOT and a bill are built here once, as a list of lines, and then drawn two ways: as HTML for the print dialog
 * (every device, iPhone included) and as ESC/POS bytes for a Bluetooth printer (Chrome on Android). One model and two
 * renderers means the paper looks the same whichever way it came out, and the layout rules — what wraps, what is
 * bold, where the rules go — are tested once, without a printer.
 *
 * Nothing here formats money or dates: the caller passes them already formatted, in the business's zone and the
 * reader's language, the same contract `receipt-text.ts` keeps.
 */

export type PaperWidth = '58' | '80';

export type TicketLine =
  /** One line of text, wrapped to the paper. `size: 2` is double height and width — the token, the heading. */
  | { kind: 'text'; text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; size?: 1 | 2 }
  /** A left and a right part on one line: "2 × Paneer Tikka ........ ₹480". The left wraps; the right never does. */
  | { kind: 'pair'; left: string; right: string; bold?: boolean }
  /**
   * One row of the bill's item table: the name wraps in its own column, the figures sit right-aligned in theirs.
   * `header` is the table's heading row (Item · Qty. · Price · Amount), drawn bold. A 58mm roll has no room for
   * a Price column, so it shows Item · Qty. · Amount — the price is the amount over the quantity, and the guest
   * reads the amount.
   */
  | { kind: 'item'; name: string; qty: string; price: string; amount: string; header?: boolean }
  /** A dashed rule across the paper. */
  | { kind: 'rule' }
  /** An empty line. */
  | { kind: 'gap' };

export interface Ticket {
  lines: TicketLine[];
  /** Feed and cut after the last line. A KOT is torn off the counter's roll as often as a bill. */
  cut: boolean;
}

/** How many characters of the printer's normal font fit across the paper: font A is 12 dots wide. */
export function charsPerLine(width: PaperWidth): number {
  return width === '58' ? 32 : 48;
}

/** The printable width in dots, at the 203 dpi every cheap thermal printer prints at. */
export function dotsPerLine(width: PaperWidth): number {
  return width === '58' ? 384 : 576;
}

/**
 * Words wrapped to `width` characters. A word longer than the line is cut, never allowed to run off the paper:
 * the 40-letter dish name of the story's AC-04 has to come out whole, over two lines.
 */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const raw of para.split(/\s+/).filter(Boolean)) {
      let word = raw;
      while ([...word].length > width) {
        if (line) {
          out.push(line);
          line = '';
        }
        const chars = [...word];
        out.push(chars.slice(0, width).join(''));
        word = chars.slice(width).join('');
      }
      if (!line) line = word;
      else if ([...line].length + 1 + [...word].length <= width) line = `${line} ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * A pair as the lines it takes: the left part wrapped into the room the right part leaves, the right part on the
 * first line. A right part wider than half the paper gets a line of its own, right-aligned, under the left.
 */
export function pairLines(left: string, right: string, width: number): string[] {
  const rightLen = [...right].length;
  if (rightLen > Math.floor(width / 2)) {
    return [...wrap(left, width), ' '.repeat(Math.max(0, width - rightLen)) + right];
  }
  const room = width - rightLen - 1;
  const lefts = wrap(left, room);
  const first = lefts[0] ?? '';
  return [first + ' '.repeat(width - [...first].length - rightLen) + right, ...lefts.slice(1)];
}

/** The item table's column widths, in characters, for this roll. */
export function itemColumns(width: PaperWidth): { name: number; qty: number; price: number; amount: number } {
  // 58mm: 17 + 1 + 4 + 1 + 9 = 32 (no Price). 80mm: 22 + 1 + 4 + 1 + 9 + 1 + 10 = 48.
  return width === '58' ? { name: 17, qty: 4, price: 0, amount: 9 } : { name: 22, qty: 4, price: 9, amount: 10 };
}

const padLeft = (s: string, n: number) => ' '.repeat(Math.max(0, n - [...s].length)) + s;
const padRight = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].length));

/** An item row as the fixed-width lines it prints as: figures on the first line, the name wrapping under itself. */
export function itemLines(line: { name: string; qty: string; price: string; amount: string }, width: PaperWidth): string[] {
  const c = itemColumns(width);
  const names = wrap(line.name, c.name);
  const figures = ' ' + padLeft(line.qty, c.qty) + (c.price ? ' ' + padLeft(line.price, c.price) : '') + ' ' + padLeft(line.amount, c.amount);
  return names.map((n, i) => (i === 0 ? padRight(n, c.name) + figures : n));
}

/* ------------------------------------------------------------------------------------------------------------ KOT */

export type KotKind = 'new' | 'add' | 'cancel';

export interface KotItem {
  name: string;
  qty: number;
  /** Chosen add-ons and sizes, once the menu has them (Jira GRW-712): "Large", "Extra cheese". */
  options?: string[];
  note?: string | null;
}

export interface KotData {
  /** The KOT's own number for the day at this branch. */
  number: number;
  kind: KotKind;
  tokenNo: number | null;
  /** Where the order is going: "Takeaway", "Swiggy", later "T4 · AC Hall". Null when nothing names it. */
  destination: string | null;
  /** Already formatted: "14 Nov, 8:40 pm". */
  when: string;
  items: KotItem[];
  /** Printed again from the order screen: says so across the top so the kitchen does not cook it twice. */
  reprint?: boolean;
  branchName?: string | null;
}

export interface KotCopy {
  title: string;
  added: string;
  cancelled: string;
  reprint: string;
  kotNo: (n: number) => string;
  token: (n: number) => string;
  items: (n: number) => string;
}

/**
 * The kitchen's ticket: what to cook and for whom, never what it costs (story BR: no prices on a KOT).
 *
 * The token is the biggest thing on it because it is what the kitchen calls out; an addition and a cancellation
 * say so in the heading, in capitals, because a cook glancing at a ticket must not mistake "cancel this" for "make
 * this".
 */
export function kotTicket(kot: KotData, copy: KotCopy): Ticket {
  const lines: TicketLine[] = [];
  if (kot.reprint) lines.push({ kind: 'text', text: `** ${copy.reprint} **`, align: 'center', bold: true });
  const heading = kot.kind === 'cancel' ? copy.cancelled : kot.kind === 'add' ? copy.added : copy.title;
  lines.push({ kind: 'text', text: heading, align: 'center', bold: true, size: kot.kind === 'new' ? 1 : 2 });
  if (kot.tokenNo !== null) lines.push({ kind: 'text', text: copy.token(kot.tokenNo), align: 'center', bold: true, size: 2 });
  if (kot.destination) lines.push({ kind: 'text', text: kot.destination, align: 'center', bold: true });
  lines.push({ kind: 'pair', left: copy.kotNo(kot.number), right: kot.when });
  if (kot.branchName) lines.push({ kind: 'text', text: kot.branchName });
  lines.push({ kind: 'rule' });
  for (const item of kot.items) {
    lines.push({ kind: 'text', text: `${item.qty} x ${item.name}`, bold: true });
    for (const opt of item.options ?? []) lines.push({ kind: 'text', text: `  + ${opt}` });
    if (item.note) lines.push({ kind: 'text', text: `  > ${item.note}` });
  }
  lines.push({ kind: 'rule' });
  lines.push({ kind: 'text', text: copy.items(kot.items.reduce((n, i) => n + i.qty, 0)), align: 'right' });
  return { lines, cut: true };
}

/* ----------------------------------------------------------------------------------------------------------- Bill */

export interface BillItem {
  name: string;
  /** Chosen add-ons and sizes, printed under the dish: "Choice of coffee: Hot". */
  options?: string[];
  qty: number;
  /** The unit price and the line's amount, already formatted as plain figures ("209.00"). */
  price: string;
  amount: string;
}

export interface BillData {
  businessName: string;
  /** The legal name when it differs from the trading name; printed under it. */
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  gstin?: string | null;
  /** The FSSAI licence number a food business prints on every bill. */
  fssai?: string | null;
  /** "Tax invoice" / "Bill of supply" / "Receipt": what the law calls this document. */
  docTitle: string | null;
  /** The guest's name; null for a walk-in, and the line is then left for the pen ("Name:"). */
  customerName: string | null;
  /** Already formatted: "13/11/26 20:59". */
  when: string;
  /** "Dine-in: G5", "Takeaway", "Swiggy" — where the order went. Null when nothing names it. */
  orderLabel: string | null;
  cashier: string | null;
  number: string | null;
  tokenNo: number | null;
  items: BillItem[];
  totalQty: number;
  subTotal: string;
  /** Discount, each tax ("CGST @2.5%"), in order, already formatted. */
  adjustments: { label: string; amount: string }[];
  /** "+0.20" / "-0.30"; null when nothing rounded. */
  roundOff: string | null;
  /** With the currency sign: "₹1,256.00". */
  grandTotal: string;
  /** "Paid by UPI"; null on a bill printed before payment. */
  paidBy: string | null;
  footer?: string | null;
  reprint?: boolean;
}

export interface BillCopy {
  reprint: string;
  phone: (v: string) => string;
  gstin: (v: string) => string;
  fssai: (v: string) => string;
  name: (v: string) => string;
  date: (v: string) => string;
  cashier: (v: string) => string;
  billNo: (v: string) => string;
  token: (n: number) => string;
  colItem: string;
  colQty: string;
  colPrice: string;
  colAmount: string;
  totalQty: (n: number) => string;
  subTotal: string;
  roundOff: string;
  grandTotal: string;
  thanks: string;
}

/**
 * The guest's bill, laid out the way an Indian restaurant's thermal bill reads (owner's sample, 15 Nov 2026): the
 * business and its GSTIN at the top; name, date, where the order went, cashier and bill number; the item table;
 * total quantity and sub total; each tax with its rate; round off; the grand total, big; the business's own line.
 */
export function billTicket(bill: BillData, copy: BillCopy): Ticket {
  const lines: TicketLine[] = [];
  if (bill.reprint) lines.push({ kind: 'text', text: `** ${copy.reprint} **`, align: 'center', bold: true });
  lines.push({ kind: 'text', text: bill.businessName, align: 'center', bold: true, size: 2 });
  if (bill.legalName && bill.legalName !== bill.businessName) lines.push({ kind: 'text', text: bill.legalName, align: 'center' });
  if (bill.address) lines.push({ kind: 'text', text: bill.address, align: 'center' });
  if (bill.phone) lines.push({ kind: 'text', text: copy.phone(bill.phone), align: 'center' });
  if (bill.gstin) lines.push({ kind: 'text', text: copy.gstin(bill.gstin), align: 'center' });
  if (bill.fssai) lines.push({ kind: 'text', text: copy.fssai(bill.fssai), align: 'center' });
  if (bill.docTitle) lines.push({ kind: 'text', text: bill.docTitle, align: 'center', bold: true });
  lines.push({ kind: 'rule' });
  lines.push({ kind: 'text', text: copy.name(bill.customerName ?? '') });
  // Where the order went on the right of the date, as the sample has "Dine In: G5"; a counter order's token there.
  const where = [bill.orderLabel, bill.tokenNo !== null ? copy.token(bill.tokenNo) : null].filter(Boolean).join(' · ');
  lines.push({ kind: 'pair', left: copy.date(bill.when), right: where });
  if (bill.cashier || bill.number) lines.push({ kind: 'pair', left: bill.cashier ? copy.cashier(bill.cashier) : '', right: bill.number ? copy.billNo(bill.number) : '' });
  lines.push({ kind: 'rule' });
  lines.push({ kind: 'item', name: copy.colItem, qty: copy.colQty, price: copy.colPrice, amount: copy.colAmount, header: true });
  lines.push({ kind: 'rule' });
  for (const item of bill.items) {
    lines.push({ kind: 'item', name: item.name, qty: String(item.qty), price: item.price, amount: item.amount });
    for (const opt of item.options ?? []) lines.push({ kind: 'text', text: `  ${opt}` });
  }
  lines.push({ kind: 'rule' });
  lines.push({ kind: 'pair', left: copy.totalQty(bill.totalQty), right: `${copy.subTotal} ${bill.subTotal}` });
  for (const a of bill.adjustments) lines.push({ kind: 'pair', left: a.label, right: a.amount });
  lines.push({ kind: 'rule' });
  if (bill.roundOff) lines.push({ kind: 'pair', left: copy.roundOff, right: bill.roundOff });
  lines.push({ kind: 'text', text: `${copy.grandTotal} ${bill.grandTotal}`, align: 'right', bold: true, size: 2 });
  if (bill.paidBy) lines.push({ kind: 'text', text: bill.paidBy, align: 'right' });
  lines.push({ kind: 'rule' });
  if (bill.footer) lines.push({ kind: 'text', text: bill.footer, align: 'center' });
  lines.push({ kind: 'text', text: copy.thanks, align: 'center' });
  return { lines, cut: true };
}
