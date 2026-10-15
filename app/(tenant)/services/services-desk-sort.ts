import type { ServiceAdmin } from '../lib/api';

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

export function sortDesk(rows: readonly ServiceAdmin[], sort: DeskSort): ServiceAdmin[] {
  const name = (a: ServiceAdmin, b: ServiceAdmin) => a.name.localeCompare(b.name);
  const price = (s: ServiceAdmin) => (s.priceMinor === null || s.priceMinor === undefined ? Number.POSITIVE_INFINITY : Number(s.priceMinor));
  const out = [...rows];
  if (sort === 'priceAsc') return out.sort((a, b) => price(a) - price(b) || name(a, b));
  if (sort === 'priceDesc') return out.sort((a, b) => (price(b) === Infinity ? -1 : price(b)) - (price(a) === Infinity ? -1 : price(a)) || name(a, b));
  if (sort === 'duration') return out.sort((a, b) => a.durationMin - b.durationMin || name(a, b));
  return out.sort(name);
}
