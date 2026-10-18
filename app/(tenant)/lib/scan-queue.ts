/**
 * Owner, 2026-10-19 — codes scanned on the Sales screen, carried to the sell page.
 *
 * Sales has no till of its own, so a scan there is sent to the sell page. Passing the code in the address kept only
 * the last of several quick scans, and dropped the lot if the sell page was still loading. They wait in the browser's
 * session storage instead, in the order scanned, and the sell page takes them all once its shelf has loaded.
 * Old entries are ignored: a scan that never arrived must not be added to a bill a minute later.
 */
const KEY = 'growza.scanQueue';
export const SCAN_QUEUE_TTL_MS = 60_000;
export const SCAN_QUEUE_MAX = 30;
/** How long Sales waits after the last scan before opening the sell page, so a quick run is queued whole. */
export const SCAN_RUN_END_MS = 500;

type Entry = { code: string; at: number };

const store = (): Storage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

const read = (s: Storage, now: number): Entry[] => {
  try {
    const raw = JSON.parse(s.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((e): e is Entry => !!e && typeof e.code === 'string' && typeof e.at === 'number' && now - e.at <= SCAN_QUEUE_TTL_MS);
  } catch {
    return [];
  }
};

/** Adds a scanned code to the end of the queue. False when the browser would not keep it. */
export function queueScan(code: string, now: number = Date.now(), s: Storage | null = store()): boolean {
  if (!s) return false;
  try {
    const next = [...read(s, now), { code, at: now }].slice(-SCAN_QUEUE_MAX);
    s.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** Every code still fresh, oldest first, and empties the queue. */
export function takeScans(now: number = Date.now(), s: Storage | null = store()): string[] {
  if (!s) return [];
  const codes = read(s, now).map((e) => e.code);
  try {
    s.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  return codes;
}
