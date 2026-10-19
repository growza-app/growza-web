import type { ServiceAdmin } from '../lib/api';
import { ALL_TAB, RETIRED_TAB } from './services-tabs';

/**
 * Owner, 2026-10-15 — the wide Services table's sort and status filter. A typed search keeps its own ranking
 * (the best match first), so the sort applies to an unsearched list only.
 */
export type DeskSort = 'name' | 'priceAsc' | 'priceDesc' | 'duration';
export const DESK_SORTS: readonly DeskSort[] = ['name', 'priceAsc', 'priceDesc', 'duration'];
export type DeskStatus = 'all' | 'active' | 'inactive';
export const DESK_STATUSES: readonly DeskStatus[] = ['all', 'active', 'inactive'];

export const byStatus = (rows: readonly ServiceAdmin[], status: DeskStatus): ServiceAdmin[] =>
  status === 'all' ? [...rows] : rows.filter((s) => (status === 'active' ? s.active : !s.active));

/**
 * The rows the wide table's Status filter draws from.
 *
 * QA, 2026-10-17 — it filtered the rows of the tab, and the All and category tabs hold only what is being sold, so
 * "Inactive" there was always empty even with retired services on the branch. Active and Inactive now choose from the
 * whole scope the owner has picked (the branch, or the category) and "All" stays the tab's own rows — the menu being
 * sold, or on the Retired tab what was taken off it.
 */
export function deskScope<T extends ServiceAdmin>(services: readonly T[], tab: string, status: DeskStatus, inTab: readonly T[]): T[] {
  if (status === 'all' || tab === RETIRED_TAB) return byStatus(inTab, status) as T[];
  const scope = tab === ALL_TAB ? services : services.filter((s) => s.categoryId === tab);
  return byStatus(scope, status) as T[];
}

export function sortDesk(rows: readonly ServiceAdmin[], sort: DeskSort): ServiceAdmin[] {
  const name = (a: ServiceAdmin, b: ServiceAdmin) => a.name.localeCompare(b.name);
  const price = (s: ServiceAdmin) => (s.priceMinor === null || s.priceMinor === undefined ? Number.POSITIVE_INFINITY : Number(s.priceMinor));
  const out = [...rows];
  if (sort === 'priceAsc') return out.sort((a, b) => price(a) - price(b) || name(a, b));
  if (sort === 'priceDesc') return out.sort((a, b) => (price(b) === Infinity ? -1 : price(b)) - (price(a) === Infinity ? -1 : price(a)) || name(a, b));
  if (sort === 'duration') return out.sort((a, b) => a.durationMin - b.durationMin || name(a, b));
  return out.sort(name);
}
