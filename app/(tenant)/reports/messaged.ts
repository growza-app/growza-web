'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Owner, 2026-11-27 (review) — one guest can be on the overdue list, the points list and a dish's fans at once, and
 * each list had its own "Sent" that forgot itself when the sheet closed. So the owner's own WhatsApp could send the same
 * person three messages in a minute, and again the next day. This remembers, in this browser, the day each number was
 * last messaged from any of the Guests lists, and every list shows it.
 *
 * Only in this browser: nothing is sent or stored by the product (the message goes from the owner's own WhatsApp), so
 * there is nothing on the server to read back. The number is kept as a hash, never as itself, and forgotten after
 * `KEEP_DAYS`.
 */
const KEY = 'growza.messaged.v1';
/** How long a "messaged" day is remembered. */
export const KEEP_DAYS = 30;
/** Within this many days the lists say so ("Messaged 3 days ago"). */
export const SHOW_DAYS = 7;

type Book = Record<string, string>;

/** FNV-1a over the digits: enough to tell numbers apart, without keeping the number. */
export function numberKey(phone: string): string {
  let h = 0x811c9dc5;
  for (const ch of phone.replace(/\D/g, '').slice(-10)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

let cache: { raw: string | null; book: Book } = { raw: null, book: {} };
function read(): Book {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cache.book;
  }
  if (raw === cache.raw) return cache.book;
  let book: Book = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') book = parsed as Book;
  } catch {
    book = {};
  }
  cache = { raw, book };
  return book;
}

const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) l();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

/** Remember that this number was messaged today; days older than `KEEP_DAYS` are dropped on the way. */
export function markMessaged(phone: string, today: string): void {
  const book: Book = {};
  for (const [k, day] of Object.entries(read())) if (daysBetween(day, today) < KEEP_DAYS) book[k] = day;
  book[numberKey(phone)] = today;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    cache = { raw: cache.raw, book };
  }
  listeners.forEach((l) => l());
}

/** How many days ago this number was last messaged, from `book`; null when not within `SHOW_DAYS`. */
export function messagedDaysAgo(book: Readonly<Book>, phone: string, today: string): number | null {
  const day = book[numberKey(phone)];
  if (!day) return null;
  const n = daysBetween(day, today);
  return n >= 0 && n < SHOW_DAYS ? n : null;
}

const EMPTY: Book = {};

/** The lists' view of the record: `daysAgo(phone)` and `mark(phone)`, re-rendering every list when any one marks. */
export function useMessaged(today: string): { daysAgo: (phone: string) => number | null; mark: (phone: string) => void } {
  const book = useSyncExternalStore(subscribe, read, () => EMPTY);
  const daysAgo = useCallback((phone: string) => messagedDaysAgo(book, phone, today), [book, today]);
  const mark = useCallback((phone: string) => markMessaged(phone, today), [today]);
  return { daysAgo, mark };
}
