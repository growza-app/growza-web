/**
 * Jira GRW-702 — Businesses filters an admin saves under a name, to get the same view back in one tap.
 *
 * Kept in this browser (localStorage): a saved view is a convenience for the person at this desk, not a record anyone
 * else needs. Every read and write is guarded, so a private window or blocked storage just means no saved views.
 */
export interface SavedFilter {
  name: string;
  vertical: string;
  status: string;
  search: string;
}

export const SAVED_FILTERS_KEY = 'growza.admin.businesses.savedFilters';
export const MAX_SAVED = 8;

export function parseSaved(raw: string | null): SavedFilter[] {
  try {
    const value = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter((v) => v && typeof v.name === 'string' && typeof v.vertical === 'string' && typeof v.status === 'string' && typeof v.search === 'string')
      .slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

/** Saving under a name already used replaces it; the newest comes first; at most MAX_SAVED are kept. */
export function withSaved(list: SavedFilter[], next: SavedFilter): SavedFilter[] {
  const name = next.name.trim();
  if (!name) return list;
  return [{ ...next, name }, ...list.filter((f) => f.name.toLowerCase() !== name.toLowerCase())].slice(0, MAX_SAVED);
}

export function withoutSaved(list: SavedFilter[], name: string): SavedFilter[] {
  return list.filter((f) => f.name !== name);
}

export function loadSaved(): SavedFilter[] {
  try {
    return parseSaved(window.localStorage.getItem(SAVED_FILTERS_KEY));
  } catch {
    return [];
  }
}

export function storeSaved(list: SavedFilter[]): void {
  try {
    window.localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: the chips still work until the page is left.
  }
}
