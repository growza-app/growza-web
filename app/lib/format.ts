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
 * Client recency segments — deliberately the SAME boundaries the backend
 * filter uses (`CustomerStatusFilter`, src/modules/customer/repository.ts), so
 * a row chipped "Lapsed" here is exactly a row `?status=lapsed` would return.
 *
 * The backend bounds Lapsed at 30-89 days on purpose: "recently slipped,
 * worth a nudge", as distinct from Inactive ("gone, unclear if they're coming
 * back"). Someone who has never booked qualifies as neither — there is
 * nothing to win back.
 */
export const LAPSED_MIN_DAYS = 30;
export const ACTIVE_WINDOW_DAYS = 90;

export type ClientRecency = 'never' | 'active' | 'lapsed' | 'inactive';

export function clientRecency(iso: string | null | undefined, now: Date = new Date()): ClientRecency {
  if (!iso) return 'never';
  const days = (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  if (days < LAPSED_MIN_DAYS) return 'active';
  if (days < ACTIVE_WINDOW_DAYS) return 'lapsed';
  return 'inactive';
}
