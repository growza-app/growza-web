import type { BuyItem } from '../lib/api-types';
import { amount, unitWord } from '../lib/kitchen-units';

/**
 * Jira GRW-739 — What to buy, as plain data and plain text: the list grouped by who each item was last bought from (FR-02), and the
 * message the owner shares on WhatsApp. Pure, so the words and the order are tested without a browser.
 */

export interface SupplierGroup {
  /** The supplier's id, or null for items last bought with no supplier (or never bought). */
  supplierId: string | null;
  name: string | null;
  phone: string | null;
  items: BuyItem[];
}

/** Grouped by supplier, in the order the API sent the items (furthest below first): a group sits where its most urgent item does. */
export function groupBySupplier(items: readonly BuyItem[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();
  for (const item of items) {
    const key = item.supplierId ?? '';
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { supplierId: item.supplierId, name: item.supplierName, phone: item.supplierPhone, items: [] }));
    g.items.push(item);
  }
  // The items with no supplier go last: there is nobody to send them to.
  return [...groups.values()].sort((a, b) => Number(a.supplierId === null) - Number(b.supplierId === null));
}

export interface ShareWords {
  /** "To buy — {date}" */
  heading: (date: string) => string;
  /** The group with no supplier. */
  noSupplier: string;
  /** "2 tray" for an item that comes in packs. */
  packs: (n: number, label: string) => string;
}

/** How many whole packs cover a quantity, for an item that comes in packs ("tray of 30"). Null for a loose item. */
export function packsFor(item: Pick<BuyItem, 'packSize'>, qty: number): number | null {
  if (!item.packSize || item.packSize <= 0) return null;
  return Math.max(1, Math.ceil(qty / item.packSize));
}

/**
 * The shared text: business (and branch), date, then each supplier's items with the quantity to buy. `qty` is what the owner left in
 * each item's box (thousandths); an item set to nothing is left off, and a supplier with nothing left is left off with it.
 */
export function shareText(
  head: { business: string; branch: string | null; date: string },
  groups: readonly SupplierGroup[],
  qty: ReadonlyMap<string, number | null>,
  words: ShareWords,
): string {
  const out = [[head.business, head.branch].filter(Boolean).join(' · '), words.heading(head.date)];
  for (const g of groups) {
    const lines = g.items.flatMap((i) => {
      const q = qty.get(i.materialId) ?? null;
      if (q === null || q <= 0) return [];
      const packs = packsFor(i, q);
      const inPacks = packs !== null && i.packLabel ? ` (${words.packs(packs, i.packLabel)})` : '';
      return [`• ${i.name} — ${amount(q)} ${unitWord(i.unit)}${inPacks}`];
    });
    if (lines.length === 0) continue;
    out.push('', g.supplierId === null ? words.noSupplier : `${g.name}${g.phone ? ` (${g.phone})` : ''}`, ...lines);
  }
  return out.join('\n');
}

/** A manual `wa.me` link (nothing is sent until the owner sends it). A 10-digit Indian number gets its 91; no number = pick the chat. */
export function waLink(text: string, phone?: string | null): string {
  const digits = (phone ?? '').replace(/[^0-9]/g, '');
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
