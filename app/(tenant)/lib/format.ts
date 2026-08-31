/**
 * Display formatting, in one place.
 *
 * The frozen format spec (Growza Fixes design, board 2f):
 *
 *   Date, general              26 Aug 2026
 *   Date, weekday matters      Wed 26 Aug 2026
 *   Recent past                Today · 1 day ago · 2 days ago
 *   Phone                      +91 98765 43210
 *
 * Dates were previously built inline in four files with three different
 * option sets — Home dropped the year and added a comma, Clients used a
 * zero-padded day, Offers an unpadded one. Same fact, three renderings.
 *
 * Money and time live in `lib/api.ts` (formatMoney / formatTime) alongside
 * the types they format; these are the ones that had no home.
 */

/** `26 Aug 2026` */
export function formatDate(iso: string | Date, timeZone?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(d);
}

/**
 * `Wed 26 Aug 2026` — for places where which day of the week it is carries
 * meaning (a schedule header, a booking date). No comma: the spec renders it
 * as one unit, and the comma made it read as two separate facts.
 */
export function formatDateWithWeekday(iso: string | Date, timeZone?: string, { withYear = true } = {}): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    // A day picker only offers the next couple of weeks, so repeating the year
    // on every option is noise; anywhere a date is stated as a fact keeps it.
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone,
  })
    .format(d)
    // en-IN yields "Wed, 26 Aug 2026"; the spec has no comma.
    .replace(',', '');
}

/** `26 Aug` — no year, for a label already scoped to the current year (a day's schedule heading). */
export function formatDateShort(iso: string | Date, timeZone?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone }).format(d);
}

/**
 * One phone format across the app: `+91 98765 43210`.
 *
 * Numbers arrive from three places (WhatsApp webhook, dashboard forms, seed
 * data) and only some were spaced. Formatting at display time rather than at
 * write time fixes existing rows too, without a migration.
 *
 * Non-Indian or unrecognised numbers are returned untouched rather than forced
 * into a grouping that would be wrong for their country.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '—';
  const v = raw.trim().replace(/[\s()\-.]/g, '');
  const in10 = /^\+91(\d{5})(\d{5})$/.exec(v);
  if (in10) return `+91 ${in10[1]} ${in10[2]}`;
  const bare10 = /^(\d{5})(\d{5})$/.exec(v);
  if (bare10) return `+91 ${bare10[1]} ${bare10[2]}`;
  return raw.trim();
}

/** `Today` · `1 day ago` · `2 days ago` · `3 months ago` — per the spec's "recent past". */
export function formatRecency(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'Never';
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

/**
 * How long since a client last came in, as one of four named bands.
 *
 * The boundaries are the same ones the backend filters by
 * (`src/platform/segments.ts`), so a row chipped "Slipping away" here is
 * exactly a row `?status=at_risk` returns, and the card counting them shows
 * the same number. Re-deriving them in a third place is what let the Clients
 * list and Reports disagree about the same client (12-conventions.md §5).
 *
 *   Coming in    0–30 days     they are current
 *   Due a visit  31–45 days    slipped a little, easily recovered
 *   Slipping     46–90 days    worth a call before it is too late
 *   Gone quiet   91+ days      unclear if they are coming back
 *
 * Someone who has never completed a visit is in none of them: there is no
 * recency to measure and nothing to win back.
 */
export const SEGMENT_MAX_DAYS = { active: 30, due: 45, at_risk: 90 } as const;

export type ClientRecency = 'never' | 'active' | 'due' | 'at_risk' | 'inactive';

export function clientRecency(iso: string | null | undefined, now: Date = new Date()): ClientRecency {
  if (!iso) return 'never';
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= SEGMENT_MAX_DAYS.active) return 'active';
  if (days <= SEGMENT_MAX_DAYS.due) return 'due';
  if (days <= SEGMENT_MAX_DAYS.at_risk) return 'at_risk';
  return 'inactive';
}
