import { inr } from '../tokens';

/**
 * Money and date rendering for anything read straight off the API (GRW-99).
 * `inr()` in tokens.ts already exists for figures already in rupees; the one
 * thing missing is the minor-unit conversion audit diffs carry — getting that
 * wrong is exactly how 20000 gets misread as ₹20,000 instead of ₹200.
 */
export function formatMoneyMinor(minor: number): string {
  return inr(minor / 100);
}

/** `31 Aug 2026, 10:45 am` — dense enough for a list row, unambiguous enough for a diff. */
export function formatDateTime(iso: string | Date, timeZone?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(d);
}

/**
 * `3 Oct 2026` — for a plain calendar date (a billing date, a period
 * boundary), which the API sends as `YYYY-MM-DD` with no time in it.
 *
 * Parsed as UTC and rendered in UTC deliberately: `new Date('2026-10-03')` is
 * midnight UTC, so formatting it in the viewer's zone can shift it a day —
 * and a billing date that moves depending on who is looking at it is a bug,
 * not a formatting preference.
 */
export function formatDateOnly(isoDate: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * `3 Oct 2026` for a value that is a TIMESTAMP, not a date — `paid_at`,
 * `created_at`, `issued_at`.
 *
 * Its own function rather than making `formatDateOnly` tolerant of both.
 * That one is deliberately strict about receiving `YYYY-MM-DD`, and loosening
 * it would remove the very check that caught this: passing a timestamp to it
 * produces `Invalid time value`, loudly, instead of a quietly wrong date.
 *
 * Rendered in UTC for the same reason `formatDateOnly` is: these are billing
 * facts, and a payment that appears to land on a different day depending on
 * who is looking at it is a bug, not a formatting preference.
 */
export function formatTimestampDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}
