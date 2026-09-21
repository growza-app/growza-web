/**
 * Jira GRW-353 — the names of the seven weekdays in a language, from the
 * browser's own calendar data rather than from message files: a new language
 * gets its day names for nothing, and they are always the ones its speakers use.
 *
 * Index IS the weekday (0 = Sunday), so a position in the list and the data agree
 * by construction — the same rule the weekday editor's strip relies on.
 *
 * - `full`   "Sunday" / "रविवार"
 * - `short`  "Sun" / "रवि"
 * - `narrow` "S" / "र" — one letter, for the strip. English gives S M T W T F S.
 */
export interface WeekdayNames {
  full: string[];
  short: string[];
  narrow: string[];
}

/** A Sunday, at noon UTC so no time zone can move it to another day. */
const SUNDAY = Date.UTC(2023, 0, 1, 12);

const cache = new Map<string, WeekdayNames>();

export function weekdayNames(locale: string): WeekdayNames {
  const hit = cache.get(locale);
  if (hit) return hit;
  const names = (style: 'long' | 'short' | 'narrow') => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, weekday) => fmt.format(SUNDAY + weekday * 86_400_000));
  };
  const result = { full: names('long'), short: names('short'), narrow: names('narrow') };
  cache.set(locale, result);
  return result;
}
