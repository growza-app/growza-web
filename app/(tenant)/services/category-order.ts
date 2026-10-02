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
