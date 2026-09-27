import type { BookingGroup } from './appointment-display';
import type { QueueEntry } from './home-types';
import { countsAsNotMarked, liveState } from './live-state';

/**
 * Jira GRW-351 — the owner's "Right now" card: what is happening in the salon, and what needs the owner.
 *
 * Bookings today is the plan; this is the state. Like `live-state.ts` it is worked out from the clock and never
 * stored: "in the chair" is `liveState(...) === 'in_service'` (the booked time is now, or it ran over and nobody has
 * been paid yet), and a walk-in is waiting from the moment the desk added them to the queue.
 *
 * Pure and exported so the thresholds are tested here, not eyeballed on a screen.
 */

/** A visit this far past its booked end, or a walk-in waiting this long, needs the owner. 9 minutes does not (AC-03). */
export const ALERT_AFTER_MIN = 10;

/**
 * Alerts listed before "+N more" — fewer on a laptop too short for three (see `RightNow.tsx`), none at all on the
 * shortest, where one line says how many there are. Every alert is always one tap away ("See all").
 */
export const ALERTS_SHOWN = 3;

const MIN = 60_000;

/**
 * Whole minutes from `from` to `to`, rounded DOWN and never negative.
 *
 * Down, not to the nearest: 9 minutes 40 seconds is 9, so "an alert from 10 minutes" means the tenth minute has
 * passed, and the number an alert shows is never more than the time that has gone by.
 */
export function wholeMinutes(from: string | Date, to: string | Date): number {
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / MIN));
}

/**
 * Only what Home is showing: every branch, or the one picked. An item with no branch on it (an older API) stays,
 * the same rule Bookings today already used for visits.
 */
export function atBranch<T extends { locationId?: string }>(items: readonly T[], branch: string | null): T[] {
  return items.filter((x) => !branch || !x.locationId || x.locationId === branch);
}

type Group = Pick<BookingGroup, 'key' | 'appointments' | 'startAt' | 'endAt' | 'status'>;
type Waiting = Pick<QueueEntry, 'id' | 'addedAt'>;

export type NowAlert<G extends Group, Q extends Waiting> =
  | { kind: 'over_time'; key: string; minutes: number; group: G }
  | { kind: 'waiting'; key: string; minutes: number; entry: Q };

export interface RightNowState<G extends Group, Q extends Waiting> {
  /** Every alert, worst first — what "See all" lists. */
  allAlerts: Array<NowAlert<G, Q>>;
  /** The first of them, as many as the card has room for. */
  alerts: Array<NowAlert<G, Q>>;
  /** How many alerts there are beyond the listed ones: "+N more" (or, with none listed, the one-line count). */
  moreAlerts: number;
  /**
   * Who is in the chair, earliest start first. Null once the business has closed and nobody is: the row gives way
   * to tomorrow's first visit. Somebody still in the chair after closing is still shown.
   */
  inChair: G[] | null;
  /** Before closing: the next visit that has not started. After closing: tomorrow's first. */
  next: G | null;
  nextIsTomorrow: boolean;
  /** Null when the queue could not be read: the row is left out rather than shown as 0 (AC-04). */
  walkIns: { count: number; longestMin: number } | null;
  /** The queue could not be read: the card must say so, and must NOT say "Nothing needs you" (BR-12). */
  queueUnread: boolean;
  /** Nothing needs the owner, and that is known — every source was read. */
  calm: boolean;
}

const byStart = (a: Group, b: Group) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
const onTheBook = <G extends Group>(groups: readonly G[]) => groups.filter((g) => g.status !== 'cancelled' && g.status !== 'no_show').sort(byStart);

/**
 * Over time: in the chair (unpaid), 10+ minutes past the booked end, and not yet "Not marked done yet".
 *
 * The hand-over is `countsAsNotMarked` itself, so this card and Needs your attention cannot disagree about a visit:
 * from 10 to 29 minutes over it is an alert here; from 30 (`NOT_MARKED_GRACE_MIN`, the API's `endsAt + 30 min`) it is
 * counted there, and only there. It stays in the "In the chair" row until `liveState` lets it go, an hour past its
 * end, because that row is the room, not a count of things to do — and it matches the Bookings list's
 * "Getting service" beside it.
 */
export function isOverTime(group: Group, now: Date): boolean {
  return liveState(group, now) === 'in_service' && wholeMinutes(group.endAt, now) >= ALERT_AFTER_MIN && !countsAsNotMarked(group, now);
}

/**
 * The card, from today's visits and (after closing) tomorrow's, both already narrowed to the branch Home shows, the
 * walk-in queue and the clock.
 *
 * - **Over time** — see `isOverTime`. Today's visits are read after closing too: a visit still running over when the
 *   business closes stays an alert until it hands over, rather than vanishing from every card for half an hour.
 * - **Waiting** — a walk-in in the queue for 10+ minutes. The queue is today's, so a walk-in left waiting past
 *   closing is still an alert.
 * - **After closing** (`afterClose`) the card follows Bookings to tomorrow: tomorrow's first visit replaces Next up.
 */
export function rightNow<G extends Group, Q extends Waiting>(input: {
  today: readonly G[];
  /** Tomorrow's visits; read only after closing. */
  tomorrow: readonly G[] | null;
  queue: readonly Q[] | null;
  now: Date;
  afterClose: boolean;
  /** How many alerts the card has room to list (0–3); the rest are counted. */
  room?: number;
}): RightNowState<G, Q> {
  const { now, afterClose } = input;
  const today = onTheBook(input.today);

  const seated = today.filter((g) => liveState(g, now) === 'in_service');
  const inChair = afterClose && seated.length === 0 ? null : seated;
  const next = afterClose ? (onTheBook(input.tomorrow ?? [])[0] ?? null) : (today.find((g) => liveState(g, now) === 'later') ?? null);

  const allAlerts: Array<NowAlert<G, Q>> = [];
  for (const group of seated) {
    if (isOverTime(group, now)) allAlerts.push({ kind: 'over_time', key: `v:${group.key}`, minutes: wholeMinutes(group.endAt, now), group });
  }
  for (const entry of input.queue ?? []) {
    const minutes = wholeMinutes(entry.addedAt, now);
    if (minutes >= ALERT_AFTER_MIN) allAlerts.push({ kind: 'waiting', key: `w:${entry.id}`, minutes, entry });
  }
  // Longest first. A tie keeps the order above (visits, then the queue's own first-come order): sort is stable.
  allAlerts.sort((a, b) => b.minutes - a.minutes);

  const walkIns = input.queue
    ? { count: input.queue.length, longestMin: Math.max(0, ...input.queue.map((q) => wholeMinutes(q.addedAt, now))) }
    : null;

  const listed = Math.max(0, Math.min(ALERTS_SHOWN, input.room ?? ALERTS_SHOWN));
  const alerts = allAlerts.slice(0, listed);
  return {
    allAlerts,
    alerts,
    moreAlerts: allAlerts.length - alerts.length,
    inChair,
    next,
    nextIsTomorrow: afterClose,
    walkIns,
    queueUnread: input.queue === null,
    calm: allAlerts.length === 0 && input.queue !== null,
  };
}
