/**
 * Jira GRW-439 — how the services list is arranged, and the one phrase that says how long a service takes.
 *
 * Both were spread across the component before: the category was a repeated cell on every row, and the time
 * was two columns the owner had to add up. The design (section 1a) makes the category a heading and the time
 * one phrase, which only works if the arrangement is computed somewhere a test can reach.
 */

/** Everything the grouping needs of a service. Narrower than `ServiceAdmin` so a test need not invent a photo. */
export interface GroupableService {
  categoryName: string | null;
}

export interface ServiceGroup<T> {
  /** The category's name, or null for the services that belong to none. */
  name: string | null;
  items: T[];
}

/**
 * Group a page's rows under their category headings.
 *
 * `order` is the owner's own order of category names — the one the Categories sheet sets and the tabs read.
 * Without it the headings followed whatever order the rows happened to arrive in, and a branch that had just
 * been reordered showed its tabs as Nails · Hair · Bridal above headings that still said Hair · Bridal ·
 * Nails. Two answers to the same question on one screen. Caught in the browser during Jira GRW-441.
 *
 * A category not named in `order` keeps its place by first appearance, after the ones that are, so a category
 * created while the screen was open is listed rather than dropped.
 *
 * Services with no category go last, under their own heading. They are not dropped and not folded into the
 * first group: a service nobody has filed is one the owner should notice, not one that hides under "Hair".
 */
export function groupByCategory<T extends GroupableService>(
  rows: readonly T[],
  order: readonly string[] = [],
): Array<ServiceGroup<T>> {
  const byName = new Map<string, T[]>();
  const uncategorised: T[] = [];

  for (const row of rows) {
    if (row.categoryName === null) {
      uncategorised.push(row);
      continue;
    }
    const existing = byName.get(row.categoryName);
    if (existing) existing.push(row);
    else byName.set(row.categoryName, [row]);
  }

  const rank = new Map(order.map((name, i) => [name, i]));
  const groups: Array<ServiceGroup<T>> = [...byName]
    .map(([name, items], seen) => ({ name, items, at: rank.get(name) ?? order.length + seen }))
    .sort((a, b) => a.at - b.at)
    .map(({ name, items }) => ({ name, items }));

  if (uncategorised.length > 0) groups.push({ name: null, items: uncategorised });
  return groups;
}

/**
 * Jira GRW-446 — the rows in reading order: each category's services together, categories in the owner's
 * order, the unfiled ones last.
 *
 * The list is paged, and a page is a slice of THIS, not of whatever order the services arrived in. Slicing
 * first and grouping the slice is what the QA pass found: a branch with 52 services showed "Hair" on pages 1,
 * 2 and 3 with a different count each time, and the order set in the Categories sheet was being applied to an
 * arbitrary ten rows. A category the owner put first has to start on page one.
 */
export function orderedByCategory<T extends GroupableService>(
  rows: readonly T[],
  order: readonly string[] = [],
): T[] {
  return groupByCategory(rows, order).flatMap((group) => group.items);
}

/**
 * How many services each category holds across the WHOLE list, keyed by name (null for the unfiled).
 *
 * The heading quotes this and not the number of rows on the page under it. "Hair 7" above seven of eighteen,
 * beside a tab reading "Hair 18", is two answers to one question — the same disagreement GRW-441 fixed for the
 * ORDER of the headings, in the counts beside them.
 */
export function categoryTotals<T extends GroupableService>(rows: readonly T[]): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  for (const row of rows) totals.set(row.categoryName, (totals.get(row.categoryName) ?? 0) + 1);
  return totals;
}

/**
 * Whether headings are worth drawing at all.
 *
 * One group is not an arrangement — on a category's own tab every row shares a heading, and repeating it
 * above a list that is already titled with it is noise.
 */
export function worthGrouping<T extends GroupableService>(groups: ReadonlyArray<ServiceGroup<T>>): boolean {
  return groups.length > 1;
}

/**
 * "30 min · +10 cleanup", or just "30 min".
 *
 * Takes the two formatters rather than the words, so the caller's `useTranslations` stays the only place the
 * copy lives and this stays testable without a message catalogue.
 *
 * The unit is said once. "30 min · +10 min cleanup" is what came out of reusing the duration formatter for
 * both halves, and on a phone it wrapped to a second line and squeezed the service's own name.
 *
 * A service with no cleanup says nothing about cleanup. "+0 cleanup" is not a fact about the service, it is
 * the absence of one, and a column that prints it on half the rows is a column the owner learns to skip.
 */
export function timePhrase(
  service: { durationMin: number; bufferAfterMin: number },
  minutes: (count: number) => string,
  cleanup: (count: number) => string,
): string {
  const duration = minutes(service.durationMin);
  if (service.bufferAfterMin <= 0) return duration;
  return `${duration} · ${cleanup(service.bufferAfterMin)}`;
}

/**
 * The name a copy gets.
 *
 * "Haircut (copy)", then "Haircut (copy 2)" — numbered only once it has to be, because the common case is one
 * copy and "(copy 1)" reads like a mistake. Compared case-insensitively, since two services differing only in
 * case are the same service to the owner reading the list.
 */
export function copyName(original: string, existing: readonly string[], suffix: (name: string) => string): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const first = suffix(original);
  if (!taken.has(first.trim().toLowerCase())) return first;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${first} ${n}`;
    if (!taken.has(candidate.trim().toLowerCase())) return candidate;
  }
  return first;
}
