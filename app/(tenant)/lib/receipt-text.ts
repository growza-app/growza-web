/**
 * The bill a client is sent on WhatsApp after Record payment (owner, 2026-10-07).
 *
 * Plain text, sent through a `wa.me` link the desk opens and presses send on — no WhatsApp API, no template, from the
 * salon's own number. WhatsApp's own marks only: `*bold*` and `_italic_`. No dot leaders and no columns, because a
 * chat is not monospaced and the prices would never line up.
 *
 * What it leaves out, on purpose:
 * - the client's name: it is whatever the desk typed, and a misspelt name on a receipt reads worse than none;
 * - a bill number: salons have none yet, and an invented one would not match anything;
 * - a booking link: clients are not given the app.
 */

export interface ReceiptLine {
  name: string;
  amountMinor: number;
}

export interface ReceiptPackage {
  title: string;
  services: string[];
  /** What was charged for it, which the desk may have changed. */
  paidMinor: number;
  /** Its services at their own prices. */
  separateMinor: number;
}

export interface ReceiptInput {
  businessName: string | null;
  /** Only when the business has more than one branch: one branch needs no naming. */
  branchName: string | null;
  /** Already formatted in the salon's zone and the app's language. */
  when: string;
  tokenNo: number | null;
  stylist: string | null;
  singles: ReceiptLine[];
  pkg: ReceiptPackage | null;
  totalMinor: number;
  paidBy: string;
}

export interface ReceiptCopy {
  title: string;
  thanks: string;
  services: string;
  token: (n: number) => string;
  stylist: (name: string) => string;
  packageName: (title: string) => string;
  separately: (was: string, saved: string) => string;
  total: (amount: string) => string;
  saved: (amount: string) => string;
  paidBy: (mode: string) => string;
  seeYou: string;
}

/**
 * One piece of a line: plain, bold or italic. The bill is built as these, and both the WhatsApp text and the
 * on-screen preview are drawn from them — one source, so the preview never has to re-read the text's marks.
 */
export interface ReceiptSeg {
  t: string;
  bold?: boolean;
  italic?: boolean;
}
export type ReceiptRow = ReceiptSeg[];

/**
 * A name as it goes into the bill. WhatsApp reads `*`, `_`, `~` and backticks as formatting, so a package called
 * "Hair_Spa_Combo" would turn half the line italic; they become spaces.
 */
function plain(name: string): string {
  return name.replace(/[*_~`]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Same service more than once is one line — "Haircut × 2 — ₹600" — in the order they were rung up. */
function grouped(lines: ReceiptLine[]): Array<{ name: string; count: number; amountMinor: number }> {
  const out: Array<{ name: string; count: number; amountMinor: number }> = [];
  for (const line of lines) {
    const same = out.find((x) => x.name === line.name);
    if (same) {
      same.count += 1;
      same.amountMinor += line.amountMinor;
    } else out.push({ name: line.name, count: 1, amountMinor: line.amountMinor });
  }
  return out;
}

export function receiptRows(input: ReceiptInput, copy: ReceiptCopy, money: (minor: number) => string): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  const line = (...segs: ReceiptSeg[]) => rows.push(segs);
  const gap = () => rows.push([]);

  const business = input.businessName ? plain(input.businessName) : '';
  const branch = input.branchName ? plain(input.branchName) : '';
  // No name to give: the branch alone, or nothing; never a line that opens on " · ".
  if (business || branch) line(...(business ? [{ t: business, bold: true }] : []), ...(business && branch ? [{ t: ' · ' }] : []), ...(branch ? [{ t: branch }] : []));
  line({ t: copy.title });
  gap();
  line({ t: copy.thanks });
  gap();

  line({ t: `📅 ${input.when}` });
  const who = [input.tokenNo ? copy.token(input.tokenNo) : null, input.stylist ? copy.stylist(plain(input.stylist)) : null].filter(Boolean);
  if (who.length > 0) line({ t: `${input.tokenNo ? '🎟 ' : ''}${who.join(' · ')}` });
  gap();
  line({ t: copy.services, bold: true });

  for (const g of grouped(input.singles.map((x) => ({ ...x, name: plain(x.name) })))) {
    line({ t: `${g.name}${g.count > 1 ? ` × ${g.count}` : ''} — ${money(g.amountMinor)}` });
  }

  const saving = input.pkg ? Math.max(0, input.pkg.separateMinor - input.pkg.paidMinor) : 0;
  if (input.pkg) {
    line({ t: `${copy.packageName(plain(input.pkg.title))} — ${money(input.pkg.paidMinor)}` });
    if (input.pkg.services.length > 0) line({ t: '  ' }, { t: input.pkg.services.map(plain).join(', '), italic: true });
    if (saving > 0) line({ t: '  ' }, { t: copy.separately(money(input.pkg.separateMinor), money(saving)), italic: true });
  }

  gap();
  line({ t: copy.total(money(input.totalMinor)), bold: true });
  if (saving > 0) line({ t: `🎉 ${copy.saved(money(saving))}` });
  line({ t: copy.paidBy(input.paidBy) });
  gap();
  line({ t: `${copy.seeYou} 🙏` });
  return rows;
}

/** The rows as WhatsApp text: `*bold*`, `_italic_`, one row per line. */
export function rowsToText(rows: ReceiptRow[]): string {
  return rows
    .map((row) => row.map((seg) => (seg.bold ? `*${seg.t}*` : seg.italic ? `_${seg.t}_` : seg.t)).join(''))
    .join('\n');
}

export function receiptText(input: ReceiptInput, copy: ReceiptCopy, money: (minor: number) => string): string {
  return rowsToText(receiptRows(input, copy, money));
}

/** A `wa.me` link to that number with the bill typed out; the desk presses send. Digits only, country code first. */
export function whatsappHref(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
