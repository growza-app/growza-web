/**
 * Owner, 2026-10-15 — the till's sort, beside the search: by name, or by price either way. The same three for
 * services, packages and products; a typed search ranks by match instead, so the sort applies only to an
 * unsearched list (a ranked list re-sorted by price would hide the best match).
 */
/** `menu` — as the list was given (the till puts what sells most first); the default, so nothing is re-ordered unasked. */
export type MenuSort = 'menu' | 'name' | 'priceAsc' | 'priceDesc';
export const MENU_SORTS: readonly MenuSort[] = ['menu', 'name', 'priceAsc', 'priceDesc'];

export function sortMenu<T>(items: readonly T[], sort: MenuSort, name: (x: T) => string, price: (x: T) => number | null): T[] {
  const p = (x: T) => price(x) ?? Number.POSITIVE_INFINITY;
  const byName = (a: T, b: T) => name(a).localeCompare(name(b));
  const out = [...items];
  if (sort === 'menu') return out;
  if (sort === 'name') return out.sort(byName);
  if (sort === 'priceAsc') return out.sort((a, b) => p(a) - p(b) || byName(a, b));
  return out.sort((a, b) => (price(b) ?? -1) - (price(a) ?? -1) || byName(a, b));
}
