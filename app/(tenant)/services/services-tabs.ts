/**
 * Jira GRW-437 — which services a tab on the Services screen shows, and what its count says.
 *
 * Split out of `ServicesTable.tsx` for the same reason `catalogue-logic.ts` was: these are plain functions of
 * the service list and the chosen tab, so they can be tested without rendering anything.
 *
 * The rule the whole screen turns on: **`All` means the menu the owner is selling today.** It used to mean
 * every service the branch had ever had, so a salon that had retired fifteen things opened Services to
 * nineteen rows, fifteen of them greyed out, and had to scroll past the ones they deliberately took off the
 * menu to reach the four they sell. The counts agreed with the list and were just as unhelpful: `All` was
 * `services.length`, so retiring something changed no number anywhere on the screen.
 *
 * Retired services do not disappear — retiring is reversible and is how an owner parks a seasonal service —
 * they move to a tab of their own. That tab is "Retired" and not "Archived" because the button on the row
 * says Retire and the chip says Retired, and one thing should not pick up a second name on the way to its
 * own tab.
 */

/** The tabs that are not a category. A category id is a uuid, so neither can collide with one. */
export const ALL_TAB = 'all';
export const RETIRED_TAB = 'retired';

/** `all`, `retired`, or a category id. */
export type ServiceTab = string;

/** The two fields a tab decision needs. Narrower than `ServiceAdmin` so the tests can build rows by hand. */
export interface TabbableService {
  categoryId: string | null;
  active: boolean;
}

/**
 * The services listed under a tab.
 *
 * Retired is deliberately flat — every retired service at the branch, whatever category it was in. An owner
 * looking for something they took off the menu remembers the service, not which group it was filed under, and
 * splitting the drawer by category would mean hunting through tabs for one row.
 */
export function servicesOnTab<T extends TabbableService>(services: readonly T[], tab: ServiceTab): T[] {
  if (tab === RETIRED_TAB) return services.filter((s) => !s.active);
  if (tab === ALL_TAB) return services.filter((s) => s.active);
  return services.filter((s) => s.active && s.categoryId === tab);
}

/**
 * What each tab's count says — always the number of rows that tab will actually show, which is the part that
 * was wrong before: a count that disagrees with its own list teaches the owner to ignore it.
 */
export function tabCounts(services: readonly TabbableService[]): {
  all: number;
  retired: number;
  byCategory: Map<string, number>;
} {
  const byCategory = new Map<string, number>();
  let all = 0;
  let retired = 0;
  for (const s of services) {
    if (!s.active) {
      retired++;
      continue;
    }
    all++;
    if (s.categoryId) byCategory.set(s.categoryId, (byCategory.get(s.categoryId) ?? 0) + 1);
  }
  return { all, retired, byCategory };
}

/**
 * Whether to offer the Retired tab at all.
 *
 * Hidden when nothing is retired, matching the picker's existing habit of leaving out a category with nothing
 * in it: a salon that has never retired anything should not carry an empty drawer across every screen.
 */
export const hasRetired = (services: readonly TabbableService[]): boolean => services.some((s) => !s.active);

/**
 * The tab to fall back to when the selected one is no longer offered.
 *
 * Restoring the last retired service removes the Retired tab from under the owner while they are standing on
 * it. Without this they would be left looking at an empty list with no tab selected.
 */
export function tabAfterChange(services: readonly TabbableService[], tab: ServiceTab): ServiceTab {
  if (tab === RETIRED_TAB && !hasRetired(services)) return ALL_TAB;
  return tab;
}
