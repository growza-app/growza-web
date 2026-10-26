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

export interface ReceiptRewards {
  /** Points earned on this bill (e.g. 106). */
  earnedPoints?: number;
  /** Points redeemed on this bill (e.g. 100). */
  redeemedPoints?: number;
  /** Minor currency discount from redeemed points (e.g. 10000 for ₹100). */
  redeemedMinor?: number;
  /** Customer's updated available point balance after this bill (e.g. 420). */
  balancePoints?: number;
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
  /** Owner, 2026-10-15 — the till may ring up more than one package; `pkg` stays for the one-page form. */
  pkgs?: ReceiptPackage[];
  /** Owner, 2026-10-14 — products sold with the visit, one line per unit; grouped like the singles. */
  products?: ReceiptLine[];
  totalMinor: number;
  /**
   * Restaurant QA 2026-10-24 — the whole bill typed to a different figure: the total minus what the lines come to
   * (below nought is a discount). The lines then show their own prices and this one row says what changed, rather
   * than every line carrying an odd share of it ("Paneer Tikka — ₹218.18") and nothing saying a discount was given.
   */
  adjustMinor?: number;
  /**
   * Jira GRW-648 — points the client spent on this bill, and what they took off it.
   *
   * Its own row rather than part of `adjustMinor`, which is the desk typing over the total. A client reading
   * this has to be able to see that a hundred of their points went, and the bill is the only place they ever
   * will: the lines are stored net of it (the owner's decision, 2026-10-24), so without this row the total is
   * simply smaller than the lines with nothing saying why.
   */
  rewardPoints?: number;
  rewardMinor?: number;
  /** What this bill EARNED them, for the line under the total. The reason to come back, in six words. */
  earnedPoints?: number;
  paidBy: string;
  /** Optional loyalty / reward points earned, redeemed, and remaining balance on this bill. */
  rewards?: ReceiptRewards | null;
  /** Optional Google review link for the branch or business, appended at the foot of the receipt. */
  googleReviewUrl?: string | null;
}

export interface ReceiptCopy {
  title: string;
  thanks: string;
  services: string;
  /** The heading over the product lines; absent means they are listed under `services`. */
  products?: string;
  token: (n: number) => string;
  stylist: (name: string) => string;
  packageName: (title: string) => string;
  separately: (was: string, saved: string) => string;
  total: (amount: string) => string;
  discount?: (amount: string) => string;
  extra?: (amount: string) => string;
  /** "Reward points used: 100 (−₹100)". Absent means the bill never mentions points. */
  rewardUsed?: (points: number, amount: string) => string;
  /** "You earned 38 points towards your next visit." */
  earned?: (points: number) => string;
  saved: (amount: string) => string;
  paidBy: (mode: string) => string;
  seeYou: string;
  reviewPrompt?: string;
  rewardsTitle?: string;
  rewardRedeemed?: (points: number, amount: string) => string;
  rewardEarned?: (points: number) => string;
  rewardBalance?: (points: number) => string;
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
  const pkgs = [...(input.pkg ? [input.pkg] : []), ...(input.pkgs ?? [])];
  const products = input.products ?? [];
  let saving = 0;
  if (input.singles.length > 0 || pkgs.length > 0 || products.length === 0) {
    gap();
    line({ t: copy.services, bold: true });

    for (const g of grouped(input.singles.map((x) => ({ ...x, name: plain(x.name) })))) {
      line({ t: `${g.name}${g.count > 1 ? ` × ${g.count}` : ''} — ${money(g.amountMinor)}` });
    }

    for (const pkg of pkgs) {
      const saved = Math.max(0, pkg.separateMinor - pkg.paidMinor);
      saving += saved;
      line({ t: `${copy.packageName(plain(pkg.title))} — ${money(pkg.paidMinor)}` });
      if (pkg.services.length > 0) line({ t: '  ' }, { t: pkg.services.map(plain).join(', '), italic: true });
      if (saved > 0) line({ t: '  ' }, { t: copy.separately(money(pkg.separateMinor), money(saved)), italic: true });
    }
  }

  if (products.length > 0) {
    gap();
    line({ t: copy.products ?? copy.services, bold: true });
    for (const g of grouped(products.map((x) => ({ ...x, name: plain(x.name) })))) {
      line({ t: `${g.name}${g.count > 1 ? ` × ${g.count}` : ''} — ${money(g.amountMinor)}` });
    }
  }

  gap();
  const adjust = input.adjustMinor ?? 0;
  if (adjust < 0 && copy.discount) line({ t: copy.discount(money(-adjust)) });
  if (adjust > 0 && copy.extra) line({ t: copy.extra(money(adjust)) });
  // Above the total, where every other thing that changed it sits.
  if (input.rewardPoints && input.rewardMinor && copy.rewardUsed) {
    line({ t: copy.rewardUsed(input.rewardPoints, money(input.rewardMinor)) });
  }
  const rw = input.rewards;
  if (rw?.redeemedMinor && rw.redeemedMinor > 0) {
    const pts = rw.redeemedPoints ?? Math.round(rw.redeemedMinor / 100);
    const label = copy.rewardRedeemed ? copy.rewardRedeemed(pts, money(rw.redeemedMinor)) : `Reward points redeemed (${pts} pts): −${money(rw.redeemedMinor)}`;
    line({ t: label });
  }
  line({ t: copy.total(money(input.totalMinor)), bold: true });
  if (input.earnedPoints && copy.earned) line({ t: `⭐ ${copy.earned(input.earnedPoints)}` });
  if (saving > 0) line({ t: `🎉 ${copy.saved(money(saving))}` });
  line({ t: copy.paidBy(input.paidBy) });
  if (rw && ((rw.earnedPoints && rw.earnedPoints > 0) || rw.balancePoints !== undefined)) {
    gap();
    line({ t: copy.rewardsTitle ?? 'Rewards', bold: true });
    if (rw.earnedPoints && rw.earnedPoints > 0) {
      line({ t: `★ ${copy.rewardEarned ? copy.rewardEarned(rw.earnedPoints) : `+${rw.earnedPoints} Reward Points earned`}` });
    }
    if (rw.balancePoints !== undefined) {
      line({ t: copy.rewardBalance ? copy.rewardBalance(rw.balancePoints) : `Available balance: ${rw.balancePoints} pts` });
    }
  }
  gap();
  line({ t: `${copy.seeYou} 🙏` });
  const reviewUrl = input.googleReviewUrl ? cleanGoogleReviewUrl(input.googleReviewUrl).trim() : '';
  if (reviewUrl && /^https:\/\//i.test(reviewUrl)) {
    gap();
    line({ t: `★ ${copy.reviewPrompt ?? 'Leave us a Google review:'}` });
    line({ t: reviewUrl });
  }
  return rows;
}

/**
 * Shortens long Google Search / Google Maps review URLs so WhatsApp receipts never print
 * multi-line session/tracking strings:
 * - Converts `0x<hex1>:0x<hex2>` feature IDs (`#lrd=0x...:0x...` or `!1s0x...:0x...`) to
 *   `https://maps.google.com/?cid=<decimal>` (49 chars).
 * - Strips all tracking query params (`sxsrf`, `sca_esv`, `rlz`, etc.) and `#sv=...` state
 *   fragments from `google.com/search` URLs, keeping only `q` (or `kgmid`).
 */
export function cleanGoogleReviewUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  try {
    const u = new URL(trimmed);
    if (/(^|\.)google\./i.test(u.hostname)) {
      const fidMatch = decodedOrRaw(trimmed).match(/0x[0-9a-fA-F]+:0x([0-9a-fA-F]{8,16})/);
      if (fidMatch?.[1]) {
        const cid = BigInt(`0x${fidMatch[1]}`).toString(10);
        return `https://maps.google.com/?cid=${cid}`;
      }
      if (u.pathname === '/search') {
        const q = u.searchParams.get('q');
        const kgmid = u.searchParams.get('kgmid');
        u.search = '';
        if (q) u.searchParams.set('q', q);
        else if (kgmid) u.searchParams.set('kgmid', kgmid);
        if (u.hash && !u.hash.startsWith('#lrd=')) {
          u.hash = '';
        } else if (u.hash.startsWith('#lrd=')) {
          u.hash = u.hash.replace(/,+$/, '');
        }
        return u.toString();
      }
    }
    return trimmed;
  } catch {
    return raw;
  }
}

function decodedOrRaw(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
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

/**
 * The OTHER message this screen can hand a client: what was just booked, or what they are waiting for
 * (owner, 2026-10-07 — "the complete confirmation should be the same for sharing WhatsApp").
 *
 * Same `wa.me` link, same marks, same share-and-print row as the bill. Different facts, because a booking's
 * job is to be read back later: when, with whom, and which token. It never says "paid".
 *
 * No services and no money (owner, 2026-10-07). Both would be a quote taken before the visit, and a visit
 * grows: somebody booked for a haircut leaves having had a beard trim too. A client holding a message that
 * says ₹300 and a bill that says ₹800 is an argument at the counter that the message started. Prices belong
 * on the receipt, which is written when the work is done and cannot be overtaken.
 */
export interface ConfirmInput {
  businessName: string | null;
  branchName: string | null;
  /** A booking's day and time, already formatted. Null for a queued visit, which has a token instead. */
  when: string | null;
  tokenNo: number | null;
  stylist: string | null;
}

export interface ConfirmCopy {
  /** "Booking confirmed", or "You are in the queue". */
  title: string;
  token: (n: number) => string;
  stylist: (name: string) => string;
  /**
   * The closing line — "See you then!" for a booking, "See you soon!" for a queue.
   *
   * Owner, 2026-10-07: it must not promise a call. Nothing in Growza rings anybody, and a queue is called out
   * across the room by its token number — a message saying otherwise is the salon breaking a promise it never made.
   */
  seeYou: string;
}

export function confirmRows(input: ConfirmInput, copy: ConfirmCopy): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  const line = (...segs: ReceiptSeg[]) => rows.push(segs);
  const gap = () => rows.push([]);

  const business = input.businessName ? plain(input.businessName) : '';
  const branch = input.branchName ? plain(input.branchName) : '';
  if (business || branch)
    line(
      ...(business ? [{ t: business, bold: true }] : []),
      ...(business && branch ? [{ t: ' · ' }] : []),
      ...(branch ? [{ t: branch }] : []),
    );
  line({ t: copy.title });
  gap();

  if (input.when) line({ t: `📅 ${input.when}` });
  const who = [
    input.tokenNo ? copy.token(input.tokenNo) : null,
    input.stylist ? copy.stylist(plain(input.stylist)) : null,
  ].filter(Boolean);
  if (who.length > 0) line({ t: `${input.tokenNo ? '🎟 ' : ''}${who.join(' · ')}` });
  if (input.when || who.length > 0) gap();

  line({ t: `${copy.seeYou} 🙏` });
  return rows;
}

export interface ReceiptCardItem {
  qty: number;
  name: string;
  amount: string;
  details: string[];
  section?: string;
}

export interface ReceiptCardAdjustment {
  label: string;
  amount: string;
  isDiscount: boolean;
}

export interface ReceiptCardModel {
  businessName: string;
  branchName: string | null;
  title: string;
  thanks: string;
  when: string | null;
  tokenLabel: string | null;
  stylist: string | null;
  itemsHeading: string;
  isOrder: boolean;
  items: ReceiptCardItem[];
  totalItemsCount: number;
  adjustments: ReceiptCardAdjustment[];
  totalLabel: string;
  totalAmount: string;
  paidBy: string | null;
  savedLine: string | null;
  rewardsEarned: string | null;
  rewardsBalance: string | null;
  seeYou: string;
  reviewPrompt?: string | null;
  googleReviewUrl?: string | null;
}

/**
 * Parses `ReceiptRow[]` into a structured `ReceiptCardModel` so both the branded on-screen graphic receipt card,
 * the 2× Retina `<canvas>` PNG exporter, and the structured WhatsApp text share the exact same model.
 */
export function parseReceiptCard(rows: ReceiptRow[]): ReceiptCardModel {
  const flat = rows.map((r) => ({
    text: r.map((s) => s.t).join(''),
    bold: r.some((s) => s.bold),
    italic: r.some((s) => s.italic),
    segs: r,
  }));

  let businessName = 'Growza';
  let branchName: string | null = null;
  let title = 'Payment receipt';
  let thanks = '';
  let when: string | null = null;
  let tokenLabel: string | null = null;
  let stylist: string | null = null;
  let itemsHeading = 'Services';
  let currentItemSection = 'Services';
  const items: ReceiptCardItem[] = [];
  const adjustments: ReceiptCardAdjustment[] = [];
  let totalLabel = 'Total paid';
  let totalAmount = '';
  let paidBy: string | null = null;
  let savedLine: string | null = null;
  let rewardsEarned: string | null = null;
  let rewardsBalance: string | null = null;
  let seeYou = '';
  let reviewPrompt: string | null = null;
  let googleReviewUrl: string | null = null;

  let idx = 0;
  // Header row(s)
  if (flat[0] && flat[0].text.trim()) {
    const first = flat[0];
    if (first.segs.length >= 3 && first.segs[1]?.t === ' · ') {
      businessName = first.segs[0]?.t ?? businessName;
      branchName = first.segs[2]?.t ?? null;
      idx = 1;
    } else if (first.bold) {
      businessName = first.text.trim();
      idx = 1;
    }
  }
  if (flat[idx] && flat[idx]!.text.trim() && !flat[idx]!.bold) {
    title = flat[idx]!.text.trim();
    idx += 1;
  }

  let section: 'pre' | 'items' | 'totals' | 'rewards' = 'pre';

  for (let i = idx; i < flat.length; i++) {
    const row = flat[i]!;
    const raw = row.text;
    const t = raw.trim();
    if (!t) {
      if (section === 'items' && items.length > 0) section = 'totals';
      continue;
    }

    if (raw.startsWith('📅 ')) {
      when = raw.replace(/^📅\s*/, '').trim();
      continue;
    }
    if (raw.startsWith('🎟 ') || /^(Token|टोकन)\s+\d+/i.test(t) || /^(Stylist|Provider|Staff|स्टाइलिस्ट):/i.test(t)) {
      const cleaned = raw.replace(/^🎟\s*/, '').trim();
      const parts = cleaned.split(' · ');
      for (const p of parts) {
        const m = p.match(/(?:Token|टोकन)\s*#?(\d+)/i);
        if (m) {
          tokenLabel = `#${m[1]!.padStart(2, '0')}`;
        } else {
          stylist = p.trim();
        }
      }
      continue;
    }

    if (section === 'pre' && !row.bold && !thanks) {
      thanks = t;
      continue;
    }

    if (row.bold) {
      if (/^(Rewards|रिवॉर्ड)/i.test(t)) {
        section = 'rewards';
        continue;
      }
      // A bold row with a colon or currency sign is the Total row; any other bold row (`Services`, `Products`, `Menu`)
      // starts or resumes an items section (even after a blank line between Services and Products).
      if (t.includes(':') || t.includes('₹')) {
        section = 'totals';
        const sep = t.lastIndexOf(':');
        if (sep > -1) {
          totalLabel = t.slice(0, sep).trim();
          totalAmount = t.slice(sep + 1).trim();
        } else {
          totalAmount = t;
        }
        continue;
      }
      currentItemSection = t;
      if (items.length === 0) itemsHeading = t;
      section = 'items';
      continue;
    }

    if (section === 'items') {
      if (row.italic && items.length > 0) {
        items[items.length - 1]!.details.push(t);
        continue;
      }
      const dashIdx = t.lastIndexOf(' — ');
      if (dashIdx > -1) {
        const left = t.slice(0, dashIdx).trim();
        const amount = t.slice(dashIdx + 3).trim();
        const qtyMatch = left.match(/^(.*?)\s*×\s*(\d+)$/);
        if (qtyMatch) {
          items.push({
            qty: Number(qtyMatch[2]!),
            name: qtyMatch[1]!.trim(),
            amount,
            details: [],
            section: currentItemSection,
          });
        } else {
          items.push({
            qty: 1,
            name: left,
            amount,
            details: [],
            section: currentItemSection,
          });
        }
        continue;
      }
    }

    if (section === 'rewards') {
      if (t.startsWith('★')) {
        rewardsEarned = t.replace(/^★\s*/, '').trim();
        continue;
      }
      if (t.includes(':')) {
        rewardsBalance = t.split(':').slice(1).join(':').trim();
        continue;
      }
    }

    if (raw.startsWith('⭐ ')) {
      rewardsEarned = raw.replace(/^⭐\s*/, '').trim();
      continue;
    }

    if (raw.startsWith('🎉 ')) {
      savedLine = raw.replace(/^🎉\s*/, '').trim();
      continue;
    }

    if (/^https:\/\//i.test(t)) {
      googleReviewUrl = cleanGoogleReviewUrl(t);
      continue;
    }

    if (t.startsWith('★') && section !== 'rewards') {
      reviewPrompt = t.replace(/^★\s*/, '').trim();
      continue;
    }

    if (raw.endsWith('🙏') || (!seeYou && i === flat.length - 1)) {
      seeYou = raw.replace(/\s*🙏\s*$/, '').trim();
      continue;
    }

    if (section === 'totals') {
      if (totalAmount && !paidBy) {
        paidBy = t;
      } else if (!totalAmount && t.includes(':')) {
        const sep = t.lastIndexOf(':');
        const label = t.slice(0, sep).trim();
        const amount = t.slice(sep + 1).trim();
        adjustments.push({
          label,
          amount,
          isDiscount: amount.startsWith('−') || amount.startsWith('-') || /discount|redeem|छूट/i.test(label),
        });
      }
    }
  }

  const totalItemsCount = items.reduce((sum, it) => sum + it.qty, 0);
  const isOrder = /^(Menu|मेनू|Your Order)/i.test(itemsHeading);

  return {
    businessName,
    branchName,
    title,
    thanks,
    when,
    tokenLabel,
    stylist,
    itemsHeading,
    isOrder,
    items,
    totalItemsCount,
    adjustments,
    totalLabel,
    totalAmount,
    paidBy,
    savedLine,
    rewardsEarned,
    rewardsBalance,
    seeYou,
    reviewPrompt,
    googleReviewUrl,
  };
}

/**
 * Formats a `ReceiptRow[]` bill into a clean, multi-line WhatsApp message using only safe BMP Unicode symbols
 * (`•`, `─`, `×`, `—`, `✓`, `★`) so 4-byte surrogate emojis never corrupt into `` in `wa.me` links or clipboards.
 */
export function formatStructuredWhatsappText(rows: ReceiptRow[]): string {
  const c = parseReceiptCard(rows);
  if (c.items.length === 0 && !c.totalAmount) {
    return rowsToText(rows)
      .replace(/📅\s*/g, '')
      .replace(/🎟\s*/g, '')
      .replace(/🎉\s*/g, '★ ')
      .replace(/\s*🙏/g, '');
  }

  const out: string[] = [];
  const head = c.branchName ? `*${c.businessName} · ${c.branchName}*` : `*${c.businessName}*`;
  out.push(head);

  const subParts = [c.title, c.tokenLabel ? `*Token ${c.tokenLabel}*` : null].filter(Boolean);
  out.push(subParts.join(' · '));
  const metaParts = [c.stylist, c.when].filter(Boolean);
  if (metaParts.length > 0) out.push(metaParts.join(' · '));

  out.push('');
  if (c.isOrder) {
    const countLabel = c.totalItemsCount === 1 ? '1 item' : `${c.totalItemsCount} items`;
    out.push(`*Your Order (${countLabel})*`);
    out.push('───────────────');
    for (const item of c.items) {
      out.push(`• ${item.qty} × ${item.name} — *${item.amount}*`);
      for (const d of item.details) {
        out.push(`  _${d}_`);
      }
    }
  } else {
    let lastSection = '';
    for (const item of c.items) {
      const sec = item.section ?? c.itemsHeading;
      if (sec !== lastSection) {
        if (lastSection) out.push('');
        out.push(`*${sec}*`);
        out.push('───────────────');
        lastSection = sec;
      }
      const label = item.qty > 1 ? `${item.name} × ${item.qty}` : item.name;
      out.push(`• ${label} — *${item.amount}*`);
      for (const d of item.details) {
        out.push(`  _${d}_`);
      }
    }
  }

  out.push('───────────────');
  for (const adj of c.adjustments) {
    out.push(`${adj.label}: ${adj.amount}`);
  }
  out.push(`*${c.totalLabel}: ${c.totalAmount}*`);
  if (c.savedLine) out.push(`★ ${c.savedLine}`);
  if (c.paidBy) out.push(`✓ ${c.paidBy}`);

  if (c.rewardsEarned || c.rewardsBalance) {
    out.push('');
    out.push('*Rewards*');
    if (c.rewardsEarned) out.push(`★ ${c.rewardsEarned}`);
    if (c.rewardsBalance) out.push(`Available balance: *${c.rewardsBalance}*`);
  }

  out.push('');
  const closing = [c.thanks, c.seeYou].filter(Boolean).join(' ');
  if (closing) out.push(closing);

  if (c.googleReviewUrl) {
    out.push('');
    out.push(`★ ${c.reviewPrompt || 'Leave us a Google review:'}`);
    out.push(c.googleReviewUrl);
  }

  return out.join('\n');
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Renders the branded Graphic Receipt Card onto a 2× Retina `<canvas>` and resolves to a PNG `Blob`
 * for 1-click clipboard copying (`Ctrl+V` / `Cmd+V` into WhatsApp) or native mobile file sharing.
 */
export async function renderReceiptCardBlob(card: ReceiptCardModel): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  const W = 440;
  const itemRowsH = card.items.reduce((acc, it) => acc + 28 + it.details.length * 18, 0);
  const adjH = card.adjustments.length * 24 + (card.savedLine ? 24 : 0);
  const rewardsH = card.rewardsEarned || card.rewardsBalance ? 68 : 0;
  const reviewH = card.googleReviewUrl ? 68 : 0;
  const H = 82 + 40 + 48 + itemRowsH + 24 + adjH + 68 + rewardsH + reviewH + 44;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Card background
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 0, 0, W, H, 14);
  ctx.fill();

  // Top dark-green header banner
  ctx.save();
  roundRect(ctx, 0, 0, W, 82, 14);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, 0, W, 82);
  grad.addColorStop(0, '#14532d');
  grad.addColorStop(1, '#166534');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 82);
  ctx.restore();

  // Brand initial logo badge
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 20, 20, 42, 42, 10);
  ctx.fill();
  ctx.fillStyle = '#14532d';
  ctx.font = `900 20px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((card.businessName.trim()[0] ?? 'G').toUpperCase(), 41, 42);

  // Business name + branch subtitle
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 18px ${font}`;
  ctx.fillText(card.businessName.slice(0, 24), 74, 34);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.84)';
  ctx.font = `600 12px ${font}`;
  const sub = [card.branchName, card.title].filter(Boolean).join(' · ');
  ctx.fillText(sub.slice(0, 36), 74, 53);

  // Token box on right of header
  if (card.tokenLabel) {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, W - 92, 18, 72, 46, 10);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#52665a';
    ctx.font = `800 10px ${font}`;
    ctx.fillText('TOKEN', W - 56, 31);
    ctx.fillStyle = '#14532d';
    ctx.font = `900 19px ${font}`;
    ctx.fillText(card.tokenLabel, W - 56, 50);
  }

  // Metadata strip (When + Stylist/Verified pill)
  ctx.fillStyle = '#f4f8f5';
  ctx.fillRect(0, 82, W, 40);
  ctx.strokeStyle = '#cbd8d0';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, 122);
  ctx.lineTo(W, 122);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#47594e';
  ctx.font = `600 12px ${font}`;
  ctx.fillText(card.when ?? card.title, 20, 102);

  const badgeText = card.stylist ?? 'Verified Receipt';
  ctx.font = `700 11px ${font}`;
  const bw = Math.min(150, ctx.measureText(badgeText).width + 20);
  ctx.fillStyle = '#e3f2e8';
  roundRect(ctx, W - 20 - bw, 91, bw, 22, 11);
  ctx.fill();
  ctx.fillStyle = '#14532d';
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, W - 20 - bw / 2, 102);

  // Section header: YOUR ORDER (N ITEMS) or SERVICES / PRODUCTS / AMOUNT
  let y = 144;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64786c';
  ctx.font = `800 11px ${font}`;
  const countWords = card.totalItemsCount === 1 ? '1 ITEM' : `${card.totalItemsCount} ITEMS`;
  const secHeader = card.isOrder ? `YOUR ORDER (${countWords})` : card.itemsHeading.toUpperCase();
  ctx.fillText(secHeader, 20, y);
  ctx.textAlign = 'right';
  ctx.fillText('AMOUNT', W - 20, y);

  y += 12;
  ctx.strokeStyle = '#e6ece8';
  ctx.beginPath();
  ctx.moveTo(20, y);
  ctx.lineTo(W - 20, y);
  ctx.stroke();
  y += 18;

  // Item rows
  for (const item of card.items) {
    const showQty = card.isOrder || item.qty > 1;
    const nameX = showQty ? 48 : 20;
    ctx.textAlign = 'left';
    if (showQty) {
      ctx.fillStyle = '#14532d';
      ctx.font = `800 12.5px ${font}`;
      ctx.fillText(`${item.qty}×`, 20, y);
    }

    ctx.fillStyle = '#1c2921';
    ctx.font = `600 13.5px ${font}`;
    const maxName = item.name.length > 34 ? `${item.name.slice(0, 32)}…` : item.name;
    ctx.fillText(maxName, nameX, y);

    ctx.textAlign = 'right';
    ctx.font = `800 13.5px ${font}`;
    ctx.fillText(item.amount, W - 20, y);
    y += 28;

    for (const d of item.details) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64786c';
      ctx.font = `italic 500 11.5px ${font}`;
      ctx.fillText(d.slice(0, 48), nameX, y - 6);
      y += 18;
    }
  }

  // Dashed divider above totals
  y += 4;
  ctx.strokeStyle = '#cbd8d0';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(20, y);
  ctx.lineTo(W - 20, y);
  ctx.stroke();
  ctx.setLineDash([]);
  y += 16;

  // Adjustments
  for (const adj of card.adjustments) {
    ctx.textAlign = 'left';
    ctx.fillStyle = adj.isDiscount ? '#15803d' : '#52665a';
    ctx.font = `${adj.isDiscount ? 700 : 600} 12.5px ${font}`;
    ctx.fillText(adj.label, 20, y);
    ctx.textAlign = 'right';
    ctx.fillText(adj.amount, W - 20, y);
    y += 24;
  }

  if (card.savedLine) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#15803d';
    ctx.font = `700 12px ${font}`;
    ctx.fillText(`★ ${card.savedLine}`, 20, y);
    y += 24;
  }

  // Total Paid highlight bar
  ctx.fillStyle = '#f0f7f2';
  roundRect(ctx, 20, y - 6, W - 40, 52, 10);
  ctx.fill();
  ctx.strokeStyle = '#cce3d4';
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#14532d';
  ctx.font = `800 13px ${font}`;
  ctx.fillText(card.totalLabel.toUpperCase(), 34, y + 12);
  if (card.paidBy) {
    ctx.fillStyle = '#15803d';
    ctx.font = `700 11.5px ${font}`;
    ctx.fillText(`✓ ${card.paidBy}`, 34, y + 30);
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = '#14532d';
  ctx.font = `900 22px ${font}`;
  ctx.fillText(card.totalAmount, W - 34, y + 21);
  y += 60;

  // Optional Rewards banner
  if (card.rewardsEarned || card.rewardsBalance) {
    ctx.fillStyle = '#fef3c7';
    roundRect(ctx, 20, y, W - 40, 52, 10);
    ctx.fill();
    ctx.strokeStyle = '#fde68a';
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    roundRect(ctx, 32, y + 10, 32, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `900 16px ${font}`;
    ctx.fillText('★', 48, y + 27);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#78350f';
    ctx.font = `800 12.5px ${font}`;
    ctx.fillText(card.rewardsEarned ?? 'Reward Points Updated', 74, y + 20);
    ctx.fillStyle = '#92400e';
    ctx.font = `600 11px ${font}`;
    ctx.fillText('Use your points on your next visit', 74, y + 36);

    if (card.rewardsBalance) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#92400e';
      ctx.font = `700 10px ${font}`;
      ctx.fillText('BALANCE', W - 32, y + 18);
      ctx.fillStyle = '#78350f';
      ctx.font = `900 14.5px ${font}`;
      ctx.fillText(card.rewardsBalance, W - 32, y + 35);
    }
    y += 68;
  }

  // Optional Google Review banner
  if (card.googleReviewUrl) {
    ctx.fillStyle = '#fef3c7';
    roundRect(ctx, 20, y, W - 40, 52, 10);
    ctx.fill();
    ctx.strokeStyle = '#fde68a';
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    roundRect(ctx, 32, y + 10, 32, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `900 16px ${font}`;
    ctx.fillText('★', 48, y + 27);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#78350f';
    ctx.font = `800 12.5px ${font}`;
    const promptLabel = (card.reviewPrompt || 'Leave us a Google review').replace(/:+\s*$/, '');
    ctx.fillText(promptLabel, 74, y + 20);

    ctx.fillStyle = '#92400e';
    ctx.font = `600 11px ${font}`;
    ctx.fillText(card.googleReviewUrl.slice(0, 52), 74, y + 36);
    y += 68;
  }

  // Footer strip
  const footerY = H - 36;
  ctx.fillStyle = '#f8faf9';
  ctx.fillRect(0, footerY, W, 36);
  ctx.strokeStyle = '#e6ece8';
  ctx.beginPath();
  ctx.moveTo(0, footerY);
  ctx.lineTo(W, footerY);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#52665a';
  ctx.font = `600 11.5px ${font}`;
  const footText = [card.thanks, card.seeYou].filter(Boolean).join(' ') || `Thank you for visiting ${card.businessName}!`;
  ctx.fillText(footText.slice(0, 62), W / 2, footerY + 18);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
