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
 * Money is here too since the owner-app audit of 2026-10-10 (`formatMoney`); time still lives in `lib/api.ts`
 * (formatTime) beside the types it formats.
 */

/**
 * The Intl locale for a dashboard language. English keeps `en-IN` ("26 Aug 2026"); another
 * language uses its India variant, so month and weekday names come from its own calendar data.
 * Jira GRW-364.
 */
export function intlLocale(locale: string = 'en'): string {
  return `${locale}-IN`;
}

/** `26 Aug 2026` */
export function formatDate(iso: string | Date, timeZone?: string, locale: string = 'en'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(d);
}

/**
 * `Wed 26 Aug 2026` — for places where which day of the week it is carries
 * meaning (a schedule header, a booking date). No comma: the spec renders it
 * as one unit, and the comma made it read as two separate facts.
 */
export function formatDateWithWeekday(iso: string | Date, timeZone?: string, { withYear = true, locale = 'en' }: { withYear?: boolean; locale?: string } = {}): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
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

/**
 * `Mon` / `सोम` — a weekday by number, 0 = Sunday as `Date.getDay()` counts. For a label
 * that is a day of the week and not a date (the Reports busy-hours grid). Jira GRW-363.
 */
export function weekdayShort(day: number, locale: string = 'en'): string {
  // 4 Jan 1970 was a Sunday; noon UTC keeps it the same day in every Indian zone.
  const date = new Date(Date.UTC(1970, 0, 4 + day, 12));
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' }).format(date);
}

/** `26 Aug` — no year, for a label already scoped to the current year (a day's schedule heading). */
export function formatDateShort(iso: string | Date, timeZone?: string, locale: string = 'en'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone }).format(d);
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
export function formatRecency(iso: string | null | undefined, now: Date = new Date(), lang: string = 'en'): string {
  const days = iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000) : 0;
  // Jira GRW-478 (U-3) — "Today" and "days ago" stayed English on a Hindi screen.
  if (lang === 'hi') {
    if (!iso) return 'कभी नहीं';
    if (days <= 0) return 'आज';
    if (days < 30) return `${days} दिन पहले`;
    if (days < 365) return `${Math.floor(days / 30)} महीने पहले`;
    return `${Math.floor(days / 365)} साल पहले`;
  }
  if (!iso) return 'Never';
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  // At least one: days 360–364 are twelve months, not "0 years ago".
  const years = Math.max(1, Math.floor(days / 365));
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

/**
 * Jira GRW-478 (U-3) — a report chart's bucket, labelled in the page's language. The API's label is English
 * ("1 Sep"); its `startISO` is the bucket's local midnight with the business's offset, so its date part IS the
 * local day, and formatting that day at UTC cannot slip it into a neighbour.
 */
export function chartBucketLabel(startISO: string, unit: 'day' | 'week' | 'month', locale: string, apiLabel: string): string {
  // English keeps the API's own words ("1 Sep"); Intl's en-IN would say "1 Sept".
  if (locale !== 'hi') return apiLabel;
  const [y, m, d] = startISO.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12));
  const options: Intl.DateTimeFormatOptions = unit === 'month' ? { month: 'short', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(date);
}

/**
 * Jira GRW-478 (U-3) — the heatmap's column headings. English keeps the API's short "9 … 12p" form; Hindi reads
 * the hour (0–23, the API's `hourNumbers`) on a 24-hour clock, which needs no Latin "a"/"p" and still fits a 26px
 * column.
 */
export function heatmapHourLabel(hour: number, apiLabel: string, locale: string = 'en'): string {
  return locale === 'hi' ? String(hour) : apiLabel;
}

/**
 * `₹300` · `₹499.50` · `₹1,100` — one rounding rule for every rupee figure on the screen.
 *
 * Owner-app audit 2026-10-10 — there were two. `lib/api.ts`'s formatMoney (78 call sites) used
 * `maximumFractionDigits: 0`, so a ₹499.50 service read "₹500" on the booking, checkout and report screens, while
 * nine billing components each inlined their own `Intl.NumberFormat` with "paise only when there are paise" and
 * showed "₹499.50" on the bill. Same number, two readings, and the Hindi UI got English digit grouping in the 78.
 * This is the billing rule, applied everywhere: whole rupees show none, anything else shows two.
 *
 * `minor` is paise, as a string (the API's bigint-safe form) or a number. Nothing (null, undefined, '') renders as
 * an em dash, which is what the 78 callers relied on. `locale` is a dashboard language (`en`, `hi`) or a full tag
 * (`en-IN`, `hi-IN`); the 78 callers pass none yet and keep English.
 */
export function formatMoney(minor: string | number | null | undefined, currency = 'INR', locale: string = 'en'): string {
  if (minor === null || minor === undefined || minor === '') return '—';
  const paise = typeof minor === 'number' ? minor : Number(minor);
  if (!Number.isFinite(paise)) return '—';
  const tag = locale.includes('-') ? locale : intlLocale(locale);
  const whole = Math.round(paise) % 100 === 0;
  return new Intl.NumberFormat(tag, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(paise / 100);
}
