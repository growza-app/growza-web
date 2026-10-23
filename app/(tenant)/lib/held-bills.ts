/**
 * Restaurant QA 2026-10-24 — a bill put on hold survives a reload and a trip to another screen.
 *
 * Held bills lived only in the till's memory: a table's order held while the next guest paid was gone the moment
 * anyone opened Orders, or the page reloaded. They now wait in the tab's session storage, one list per branch and
 * per person signed in, so a held bill is still there when the till is opened again in that tab. Session storage,
 * not local storage: a held bill names a guest, and it should not outlive the tab on a shared counter computer.
 * A bill held more than a day ago is dropped — nobody comes back for yesterday's table.
 */
const PREFIX = 'growza.heldBills.';
export const HELD_BILLS_TTL_MS = 24 * 60 * 60 * 1000;
export const HELD_BILLS_MAX = 20;

type Stamped<T> = T & { id: string; heldAt: number };

const store = (): Storage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

/** Null when there is no branch to keep them under: nothing is kept, as before. */
export function heldBillsKey(locationId: string | null, who: string | null): string | null {
  return locationId ? `${PREFIX}${locationId}.${who ?? 'anyone'}` : null;
}

export function loadHeldBills<T extends { id: string }>(key: string | null, now: number = Date.now(), s: Storage | null = store()): Stamped<T>[] {
  if (!key || !s) return [];
  try {
    const raw = JSON.parse(s.getItem(key) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (b): b is Stamped<T> => !!b && typeof b.id === 'string' && typeof b.heldAt === 'number' && Array.isArray(b.lines) && now - b.heldAt <= HELD_BILLS_TTL_MS,
    );
  } catch {
    return [];
  }
}

/** Writes the list as it is now; an empty list leaves nothing behind. */
export function saveHeldBills<T extends { id: string; heldAt: number }>(key: string | null, bills: readonly T[], s: Storage | null = store()): void {
  if (!key || !s) return;
  try {
    if (bills.length === 0) s.removeItem(key);
    else s.setItem(key, JSON.stringify(bills.slice(0, HELD_BILLS_MAX)));
  } catch {
    // The browser would not keep it: the bills still work for as long as the till is open.
  }
}
