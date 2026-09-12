/**
 * Jira GRW-219 — a wall-clock time in the salon's zone, as an instant.
 *
 * The move sheet lets a receptionist type a time — "17:45" — and the API takes
 * an instant. Nothing in this app converted in that direction before: every
 * other screen formats an instant FOR a zone, which `Intl` does on its own.
 *
 * Doing it with `new Date('2026-11-18T17:45')` would read the BROWSER's zone,
 * which is the standing rule this repo has been bitten by before
 * (GRW-165 — every date in the system is IST, never the viewer's guess). A
 * receptionist on a laptop still set to UTC would move a booking five and a
 * half hours wrong, and every screen would agree with itself about it.
 *
 * No luxon: the dashboard bundle does not carry it, and shipping a date
 * library to a phone on salon wifi for one conversion is not a trade worth
 * making. `Intl` is already there and already correct about zones.
 */

/**
 * How far `timeZone` is ahead of UTC at a given instant, in milliseconds.
 *
 * Derived by asking `Intl` what the wall clock reads there and subtracting —
 * the only way to get an offset out of the platform, since `Intl` exposes
 * formatted fields and never the offset itself.
 */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const field = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  const asIfUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    // `hour12: false` renders midnight as "24" in some engines rather than
    // "00", which would push the answer a whole day forward.
    field('hour') % 24,
    field('minute'),
    field('second'),
  );
  return asIfUtc - instant.getTime();
}

/**
 * `2026-11-18` + `17:45` in `Asia/Kolkata` → the instant that is.
 *
 * Solved by iteration rather than algebra, because the offset depends on the
 * answer: `instant = naive - offset(instant)`. Two passes is exact everywhere
 * except a wall-clock time that does not exist (the hour a zone springs
 * forward), where it settles on the instant immediately after the gap — which
 * is the useful answer for a booking, and the one every calendar gives.
 */
export function zonedDateTimeToUtc(dateIso: string, hhmm: string, timeZone: string): Date | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  const time = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!date || !time) return null;

  const hour = Number(time[1]);
  const minute = Number(time[2]);
  if (hour > 23 || minute > 59) return null;

  const naive = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]), hour, minute);
  let instant = naive;
  for (let pass = 0; pass < 2; pass += 1) {
    instant = naive - offsetMsAt(new Date(instant), timeZone);
  }
  return new Date(instant);
}
