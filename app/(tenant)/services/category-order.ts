/**
 * Jira GRW-441 — moving a category, and what is left over.
 *
 * Pure, because the parts that go wrong are the edges: dropping a row on itself, dropping past the end, and
 * the order the server has to be sent after a drag that crossed several rows.
 */

/**
 * The order after a row moves from one position to another.
 *
 * Returns the SAME array contents when nothing actually moves, so a caller can skip the write — a drag that
 * ends where it started should not cost a round trip or a flash of reordering.
 */
export function movedOrder<T>(rows: readonly T[], from: number, to: number): T[] {
  const next = [...rows];
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return next;
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...rows];
  next.splice(to, 0, moved);
  return next;
}

/**
 * Whether ordering is a thing the owner can do at all.
 *
 * One category is not an order. Offering a handle, two arrows and a sentence about the order customers see,
 * above a list of one, is three controls that cannot change anything.
 */
export function worthOrdering(rows: readonly unknown[]): boolean {
  return rows.length > 1;
}

/**
 * The services filed under no category.
 *
 * Not a category and never treated as one: it cannot be renamed, reordered or deleted. It exists because a
 * service with no category is hidden from the booking page, and the owner has no other way to find out.
 */
export function unsorted<T extends { categoryId: string | null }>(services: readonly T[]): T[] {
  return services.filter((s) => s.categoryId === null);
}

/**
 * Jira GRW-591 — how many categories it takes before the list stops being scannable and earns a search
 * field. Twelve is roughly a phone screen and a half of 53px rows: below it, looking is faster than typing.
 */
export const FILTER_FROM = 12;

/**
 * Whether a category's name matches what the owner typed.
 *
 * Case-insensitive, accent-insensitive and on any WORD of the name, not just its start: a salon looking for
 * "Men's Hair Keratin" types "keratin", and one looking for "Facial" should not have to know whether the
 * owner who imported the menu called it "Facial" or "Fruit facial". Spaces in the term are each matched in
 * turn, so "men ker" finds it too.
 */
export function matchesFilter(name: string, term: string): boolean {
  const fold = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  const hay = fold(name);
  const words = fold(term).split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => hay.includes(w));
}
