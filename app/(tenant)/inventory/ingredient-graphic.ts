import type { ProductGraphicKind } from '../components/ProductPhoto';

/**
 * Owner, 2026-11-20 ("redesign the inventory page like this too") — each kitchen item's drawing, as the Menu gives
 * each dish one. Its NAME first (Eggs sit in "Meat & fish"; Ghee is dairy but poured), then its group, then a jar.
 * The group words are the owner's own, so they are matched loosely.
 */
export function ingredientGraphic(item: { name: string; category?: string | null }): ProductGraphicKind {
  const name = item.name.toLowerCase();
  const group = (item.category ?? '').toLowerCase();
  if (/\b(fish|prawns?|jhinga|surmai|pomfret|seafood|crab)\b/.test(name)) return 'fish';
  if (/\b(eggs?|anda)\b/.test(name)) return 'egg';
  if (/\b(chicken|mutton|meat|keema|lamb|goat)\b/.test(name)) return 'drumstick';
  if (/\b(noodles?|pasta|vermicelli|sevai)\b/.test(name)) return 'noodles';
  if (/\b(chill?i|chilies|chillies|mirchi|pepper|capsicum)\b/.test(name)) return 'chili';
  if (/\b(oil|ghee|sauce|ketchup|vinegar|syrup)\b/.test(name)) return 'oil';
  if (/\b(milk|cream|curd|dahi|paneer|cheese|butter|khoya|mawa|ice cream|yogh?urt)\b/.test(name)) return 'milk';
  if (/\b(rice|dal|daal|atta|maida|besan|rava|sooji|suji|flour|chana|rajma|wheat|oats|poha)\b/.test(name)) return 'grain';
  if (/\b(box|bag|container|foil|cup|plate|spoon|napkin|tissue)\b/.test(name)) return 'box';
  // A vegetable or herb by its name, for a list that carries no group (Inventory › Reports' rows).
  if (/\b(onions?|tomato(es)?|potato(es)?|spinach|palak|coriander|dhania|mint|pudina|garlic|ginger|cabbage|carrots?|cauliflower|gobi|peas|cucumber|lemons?|methi|curry leaves|beans|brinjal|okra|bhindi|lettuce|mushrooms?)\b/.test(name)) return 'leaf';
  if (/dairy/.test(group)) return 'milk';
  if (/meat|fish|poultry/.test(group)) return 'drumstick';
  if (/veg|fruit|herb|green|produce/.test(group)) return 'leaf';
  if (/spice|masala/.test(group)) return 'chili';
  if (/rice|flour|dal|grain|pulse|cereal/.test(group)) return 'grain';
  if (/oil|sauce/.test(group)) return 'oil';
  if (/pack|dispos/.test(group)) return 'box';
  return 'jar';
}

/** How many group colours there are (`--cat-1` … `--cat-6`), as on the Menu. */
const HUES = 6;

/**
 * Owner, 2026-11-21 — a kitchen's groups as the owner typed them, one per name whatever its capitals: "Dairy" and
 * "dairy " are one group. The spelling kept is the first one seen. Keys are `groupKey`s.
 */
export const groupKey = (category: string | null | undefined): string => (category ?? '').trim().toLowerCase();

export function groupNames(categories: readonly (string | null | undefined)[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const c of categories) {
    const shown = c?.trim() ?? '';
    if (shown && !names.has(groupKey(shown))) names.set(groupKey(shown), shown);
  }
  return new Map([...names].sort(([, a], [, b]) => a.localeCompare(b)));
}

/** Each group's colour (1–6) by its place A–Z, keyed by `groupKey`, so it is the same on every visit; none for no group. */
export function groupHues(categories: readonly (string | null | undefined)[]): Map<string, number> {
  return new Map([...groupNames(categories).keys()].map((k, i) => [k, (i % HUES) + 1]));
}

/**
 * How full an item is, 0–1, against three times its "low at" level (so the low line sits a third of the way along).
 * Null when no low level is set: there is nothing to measure against.
 */
export function stockLevel(stock: number, lowAt: number): number | null {
  if (!(lowAt > 0)) return null;
  return Math.max(0, Math.min(1, stock / (lowAt * 3)));
}
