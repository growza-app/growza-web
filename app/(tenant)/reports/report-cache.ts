/**
 * Owner, 2026-11-24 — the Reports tabs keep what they read in the browser's MEMORY, so going back to a tab costs no
 * request and two quick taps cost one.
 *
 * - Memory only, for as long as the app is open: never localStorage or sessionStorage. Money and guests' names do not sit
 *   in a shared shop phone's storage, and a reload starts clean.
 * - Keyed by who is signed in, the business, the tab, the dates and the branch — one person's figures are never shown to
 *   another on the same phone.
 * - Fresh for 60 seconds when the dates include today (bills are still coming in); 10 minutes for days that are over.
 *   After that the old figures show at once and are read again quietly (stale-while-revalidate).
 * - One request in flight per key: a second tap waits on the first.
 * - At most MAX_ENTRIES kept; the one used longest ago goes first.
 */
export const FRESH_TODAY_MS = 60_000;
export const FRESH_PAST_MS = 10 * 60_000;
export const MAX_ENTRIES = 40;

type Entry = { at: number; value: unknown };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/** How long a reading stays fresh: a minute while today is in the dates, ten once every day is over. */
export function freshFor(toISO: string, todayISO: string): number {
  return toISO >= todayISO ? FRESH_TODAY_MS : FRESH_PAST_MS;
}

/** What is kept for a key, if anything (marks it as just used). */
export function peek<T>(key: string): { value: T; at: number } | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  store.delete(key);
  store.set(key, e);
  return { value: e.value as T, at: e.at };
}

export function isFresh(entry: { at: number }, ttlMs: number, now = Date.now()): boolean {
  return now - entry.at < ttlMs;
}

function keep(key: string, value: unknown, at: number): void {
  store.delete(key);
  store.set(key, { at, value });
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
}

/** Read once: a request already in flight for the key is shared; what comes back is kept. A failure keeps nothing. */
export function fetchOnce<T>(key: string, load: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = load()
    .then((value) => {
      keep(key, value, now());
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Forget everything (tests; signing out reloads the app anyway). */
export function clearReportCache(): void {
  store.clear();
  inflight.clear();
}
