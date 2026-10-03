/**
 * Jira GRW-446 — how long something takes, said the way a person says it.
 *
 * The product had three answers to one question. The service sheet's footnote said "The slot shows as 730
 * min" for a twelve-hour service, its stepper said "720 min", and the package preview said "Takes ~2.8 hrs"
 * for two hours and forty-five minutes. Nobody reads any of those out loud.
 *
 * Under an hour the unit is minutes and nothing else; at an hour or more it is hours, with the minutes only
 * when there are any — "1 hr", "2 hrs 45 min". Decimal hours are gone: 2.8 of an hour is not a thing an owner
 * can put in a diary.
 *
 * The words come in rather than live here, so the one piece of arithmetic is shared and every screen keeps
 * saying it in the reader's own language.
 */

export interface DurationWords {
  /** "{count} min" */
  minutes: (count: number) => string;
  /** "{count} hr" / "{count} hrs" */
  hours: (count: number) => string;
  /** "{hours} hrs {minutes} min" */
  hoursMinutes: (hours: number, minutes: number) => string;
}

export function durationPhrase(totalMin: number, words: DurationWords): string {
  const total = Number.isFinite(totalMin) ? Math.max(0, Math.round(totalMin)) : 0;
  if (total < 60) return words.minutes(total);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? words.hours(hours) : words.hoursMinutes(hours, minutes);
}
