import type { TableSort } from '../components/primitives';

/**
 * Jira GRW-693 — how the Businesses list is ordered. The API owns the order (the list is paged on the server); this
 * only decides which key and which way, and keeps it in the URL so a reload or a shared link shows the same order.
 */
export const BUSINESS_SORT_KEYS = ['name', 'plan', 'status', 'created'] as const;
export type BusinessSortKey = (typeof BUSINESS_SORT_KEYS)[number];

/** Newest first, as the list has always opened. */
export const DEFAULT_BUSINESS_SORT: TableSort = { key: 'created', dir: 'desc' };

const isKey = (v: string | null): v is BusinessSortKey => v !== null && (BUSINESS_SORT_KEYS as readonly string[]).includes(v);

/** Read from `?sort=&dir=`; anything unknown falls back to newest first. */
export function sortFromParams(params: { get(name: string): string | null }): TableSort {
  const key = params.get('sort');
  if (!isKey(key)) return DEFAULT_BUSINESS_SORT;
  const dir = params.get('dir');
  return { key, dir: dir === 'asc' || dir === 'desc' ? dir : firstDir(key) };
}

/** A date opens newest first; a name, plan or status opens A→Z. */
function firstDir(key: string): 'asc' | 'desc' {
  return key === 'created' ? 'desc' : 'asc';
}

/** A press on a heading: the same column reverses, another column starts at its own first direction. */
export function nextSort(current: TableSort, key: string): TableSort {
  return current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir(key) };
}

export const isDefaultSort = (s: TableSort) => s.key === DEFAULT_BUSINESS_SORT.key && s.dir === DEFAULT_BUSINESS_SORT.dir;

/** The phone has no column headings, so the same orders are a menu (AC-03). Value is `key:dir`. */
export const MOBILE_SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'created:desc', label: 'Newest first' },
  { value: 'created:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'name:desc', label: 'Name Z–A' },
  { value: 'plan:asc', label: 'Plan' },
  { value: 'status:asc', label: 'Status' },
];

export function sortFromOption(value: string): TableSort {
  const [key, dir] = value.split(':');
  return isKey(key ?? null) && (dir === 'asc' || dir === 'desc') ? { key: key!, dir } : DEFAULT_BUSINESS_SORT;
}
