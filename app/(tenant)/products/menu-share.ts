import { shareMoney, sharePhone } from '@growza-app/shared';
import type { Product, ProductCategory } from '../lib/api-types';
import { productShareItem } from '../lib/share-on-whatsapp';
import { groupBySection } from './menu-manager';

/**
 * Owner, 2026-11-21 ("share the complete menu via WhatsApp", format approved) — the whole menu as one WhatsApp message:
 *
 *   🍽️ *Spice Garden — Menu*
 *
 *   *Starters*
 *   Chicken Tikka — ₹260
 *   Tandoori Chicken — Half ₹190 · Full ₹250
 *
 *   📍 Spice Garden, Indiranagar
 *   📞 Order: 98450 12345
 *   Prices as of 21 Nov 2026
 *
 * Sections in the Menu's own order, dishes A–Z inside each, a Half and a Full of one dish on one line. Taken-off dishes
 * are left out (`productShareItem` says null). The dish names and section names are the owner's own words; only the
 * frame (title, Order, Prices as of, Half, Full) is translated. Growza sends nothing: this is text for `wa.me`.
 */
export interface MenuShareWords {
  /** "{business} — Menu" */
  title: (business: string) => string;
  /** "Order: {phone}" */
  order: (phone: string) => string;
  /** "Prices as of {date}" */
  asOf: (date: string) => string;
  half: string;
  full: string;
  /** The heading for dishes in no section. */
  other: string;
}

export interface MenuShareContext {
  businessName: string;
  branchName: string | null;
  phone: string | null;
  /** Today, already in words ("21 Nov 2026"). */
  dateText: string;
}

const PORTION = /\s*\((half|full)\)\s*$/i;

interface Line {
  sortKey: string;
  text: string;
}

/** One section's lines: A–Z, with a dish's Half and Full joined. */
function sectionLines(rows: readonly Product[], w: MenuShareWords): string[] {
  const priced = rows
    .map((p) => ({ p, item: productShareItem(p, { counted: false }) }))
    .filter((x): x is { p: Product; item: NonNullable<typeof x.item> } => x.item !== null);
  const price = (item: (typeof priced)[number]['item']) =>
    item.priceMinor == null ? null : item.priceIsFrom ? `${shareMoney(item.priceMinor)}+` : shareMoney(item.priceMinor);

  // Half and Full of the same dish, by the name without its "(Half)" / "(Full)".
  const pairs = new Map<string, { half?: (typeof priced)[number]; full?: (typeof priced)[number] }>();
  for (const x of priced) {
    const m = x.p.name.match(PORTION);
    if (!m) continue;
    const base = x.p.name.replace(PORTION, '').trim().toLowerCase();
    const slot = pairs.get(base) ?? {};
    if (m[1]!.toLowerCase() === 'half') slot.half = x;
    else slot.full = x;
    pairs.set(base, slot);
  }

  const lines: Line[] = [];
  const joined = new Set<string>();
  for (const x of priced) {
    const name = x.p.name.trim();
    const base = name.replace(PORTION, '').trim();
    const pair = pairs.get(base.toLowerCase());
    if (PORTION.test(name) && pair?.half && pair.full) {
      if (joined.has(base.toLowerCase())) continue;
      joined.add(base.toLowerCase());
      const h = price(pair.half.item);
      const f = price(pair.full.item);
      const parts = [h ? `${w.half} ${h}` : null, f ? `${w.full} ${f}` : null].filter(Boolean);
      lines.push({ sortKey: base, text: parts.length ? `${base} — ${parts.join(' · ')}` : base });
      continue;
    }
    const p = price(x.item);
    lines.push({ sortKey: name, text: p ? `${name} — ${p}` : name });
  }
  return lines.sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { sensitivity: 'base', numeric: true })).map((l) => l.text);
}

/** The message, or null when no dish is on the menu (nothing to send). */
export function menuShareText(
  rows: readonly Product[],
  categories: readonly Pick<ProductCategory, 'id' | 'name'>[],
  ctx: MenuShareContext,
  w: MenuShareWords,
): string | null {
  const blocks: string[] = [];
  for (const g of groupBySection(rows, categories)) {
    const lines = sectionLines(g.rows, w);
    if (lines.length === 0) continue;
    blocks.push(`*${(g.name ?? w.other).trim()}*\n${lines.join('\n')}`);
  }
  if (blocks.length === 0) return null;

  const business = ctx.businessName.trim();
  const branch = ctx.branchName?.trim();
  const from = branch && branch.toLowerCase() !== business.toLowerCase() ? `${business}, ${branch}` : business;
  const phone = sharePhone(ctx.phone);
  const foot = [from ? `📍 ${from}` : null, phone ? `📞 ${w.order(phone)}` : null, w.asOf(ctx.dateText)].filter(Boolean);
  return `🍽️ *${w.title(business)}*\n\n${blocks.join('\n\n')}\n\n${foot.join('\n')}`;
}
