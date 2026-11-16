'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { api, ApiError } from './api';

/**
 * Jira GRW-716 — the till keeps billing when the internet drops.
 *
 * While online, the till asks its branch for a LETTER (`POST /api/v1/till-devices`) and keeps it. Offline, a paid counter
 * order of products is kept HERE, on this device, under a token of that letter and the till's own count for the day
 * ("A12", owner 2026-11-16, option B); its kitchen slip and a receipt print from what the till already has. When the
 * connection is back each order is sent, oldest first, with the id this device made for it as the idempotency key — so a
 * send that is cut off halfway and retried is still one order (BR-01).
 *
 * Kept per BRANCH, not per person: a counter that signs out with orders still waiting does not lose them — the next
 * sign-in of the same business sends them. A branch id is one business's, and the server checks the till's letter
 * against the session's own business, so an order can never land in another business (it fails, and says so).
 *
 * Everything in storage is wrapped: a private window or blocked storage means the till cannot bill offline, never that
 * it breaks.
 */

export interface OfflineOrderBody {
  [key: string]: unknown;
  idempotencyKey: string;
  location: string;
  offline: { deviceKey: string; tokenNo: number; takenAt: string };
}

export interface OfflineItem {
  /** The id this device made for the order: its idempotency key, and the key it is listed by. */
  id: string;
  branch: string;
  token: string;
  takenAt: string;
  totalMinor: number;
  body: OfflineOrderBody;
  state: 'waiting' | 'failed';
  /** Why the server refused it, in its own words; shown beside Retry. */
  reason?: string;
}

const DEVICE_KEY = 'growza.till.device';
const QUEUE_KEY = 'growza.till.offline.v1';
const letterKey = (branch: string) => `growza.till.letter.${branch}`;
const countKey = (branch: string, day: string) => `growza.till.count.${branch}.${day}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** This browser's till id. Made once; it names the till, it authorises nothing. */
export function deviceKey(): string | null {
  const had = read(DEVICE_KEY);
  if (had) return had;
  const made = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : null;
  if (!made || !write(DEVICE_KEY, made)) return null;
  return made;
}

export function tillLetter(branch: string): string | null {
  const l = read(letterKey(branch));
  return l && /^[A-Z]{1,2}$/.test(l) ? l : null;
}

/** "A12": the letter and the count, two digits at least — the server writes the same. */
export const offlineTokenOf = (letter: string, n: number): string => `${letter}${String(n).padStart(2, '0')}`;

/** The till's next count for today at this branch, kept so a reload does not start again at 1. */
export function nextOfflineCount(branch: string, day: string): number {
  const n = Number(read(countKey(branch, day)) ?? '0');
  const next = (Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0) + 1;
  write(countKey(branch, day), String(next));
  return next;
}

/**
 * Did this request never reach the API? A fetch that could not connect throws a TypeError; a proxy in front of the API
 * answers 502/503/504 while the API is away. Either way nothing was recorded, and sending again is safe (idempotent).
 * A 4xx is the server's answer about the order itself and is NEVER taken offline: it would come back refused.
 */
export function neverArrived(e: unknown): boolean {
  if (e instanceof ApiError) return e.status === 502 || e.status === 503 || e.status === 504;
  return e instanceof TypeError;
}

/* ---------------------------------------------------------------- the store */

let items: OfflineItem[] = [];
let loaded = false;
let sending = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = read(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as OfflineItem[]) : [];
    items = Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.id === 'string' && i.body) : [];
  } catch {
    items = [];
  }
}
function save(next: OfflineItem[]): boolean {
  // BR-05 — nothing stays once it is sent: an empty queue leaves no key behind.
  const ok = write(QUEUE_KEY, next.length > 0 ? JSON.stringify(next) : null);
  items = next;
  for (const l of listeners) l();
  return ok;
}
function subscribe(l: () => void): () => void {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}
const EMPTY: OfflineItem[] = [];
const snapshot = () => (loaded ? items : EMPTY);
const serverSnapshot = () => EMPTY;

/** Keep an order taken offline. False when this device cannot keep it (storage blocked or full) — then it is not taken. */
export function keepOfflineOrder(item: Omit<OfflineItem, 'state'>): boolean {
  load();
  if (items.some((i) => i.id === item.id)) return true;
  return save([...items, { ...item, state: 'waiting' }]);
}

/** Send what is waiting at the branches this session works at, oldest first. Stops at the first one that cannot reach us. */
export async function sendOfflineOrders(branches: readonly string[]): Promise<void> {
  load();
  if (sending || items.length === 0) return;
  sending = true;
  try {
    for (const item of [...items].sort((a, b) => a.takenAt.localeCompare(b.takenAt))) {
      if (item.state !== 'waiting' || !branches.includes(item.branch)) continue;
      try {
        await api.recordCounterSale(item.body as unknown as Parameters<typeof api.recordCounterSale>[0]);
        save(items.filter((i) => i.id !== item.id));
      } catch (e) {
        // Not reachable, or not signed in right now (the session ran out while offline): wait, and send it later.
        if (neverArrived(e) || (e instanceof ApiError && (e.status === 401 || e.status === 408 || e.status === 429 || e.status >= 500))) return;
        const reason = e instanceof Error ? e.message : String(e);
        save(items.map((i) => (i.id === item.id ? { ...i, state: 'failed', reason } : i)));
      }
    }
  } finally {
    sending = false;
  }
}

/** Retry one the server refused: back in line, and sent now. */
export function retryOfflineOrder(id: string, branches: readonly string[]): void {
  save(items.map((i) => (i.id === id ? { ...i, state: 'waiting', reason: undefined } : i)));
  void sendOfflineOrders(branches);
}

/** The orders this device is holding, for the bar and the failed list. */
export function useOfflineOrders(): OfflineItem[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Is the browser online? Follows the browser's own events. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener('online', l);
      window.addEventListener('offline', l);
      return () => {
        window.removeEventListener('online', l);
        window.removeEventListener('offline', l);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** How often the till tries again while it holds orders and believes it is online. */
export const RESEND_MS = 10_000;

/**
 * Mounted once on the till: asks for this till's letter whenever it is online, and sends what is waiting — when the
 * browser says it is back, and every few seconds while anything waits (a phone's "online" can come before the network
 * actually works).
 */
export function useOfflineTill(branch: string | null, branches: readonly string[]): void {
  const online = useOnline();
  const waiting = useOfflineOrders().some((i) => i.state === 'waiting');
  const key = branches.join(',');
  useEffect(() => {
    if (!online || !branch) return;
    const device = deviceKey();
    if (!device) return;
    let gone = false;
    api
      .registerTill(branch, device)
      .then((r) => {
        if (!gone) write(letterKey(branch), r.letter);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [online, branch]);
  useEffect(() => {
    if (!online || !waiting) return;
    const list = key ? key.split(',') : [];
    void sendOfflineOrders(list);
    const timer = window.setInterval(() => void sendOfflineOrders(list), RESEND_MS);
    return () => window.clearInterval(timer);
  }, [online, waiting, key]);
}
