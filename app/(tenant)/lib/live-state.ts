import type { BookingGroup } from './appointment-display';

/**
 * Jira GRW-222 — where a visit is right now, worked out from the clock.
 *
 * ## Derived, never stored (BR-03)
 *
 * There is no "checked in" or "in service" booking status. A booking is
 * `confirmed` until somebody settles it. So "Getting service" below means **the
 * booked time is now**, not "somebody saw them sit down" — and that is why it
 * is a display label computed here, not a status written anywhere. A stored
 * check-in state is its own story.
 *
 * One consequence worth writing down: the design also shows "15 min late", and
 * that cannot be told apart from "Getting service" without a check-in. A
 * confirmed booking whose time has started looks the same in the data whether
 * the client is in the chair or still on the road, so this helper does not
 * pretend to know. Once the booked time has ENDED and nobody marked it, it
 * says so — that part is a fact. (Jira GRW-222's walk-in queue later made
 * "waiting" real for walk-ins, because adding one IS their arrival.)
 *
 * Pure and exported so the receptionist's and the stylist's Homes cannot each
 * grow their own idea of "now" (the GRW-214 lesson: a rule worth testing is
 * worth exporting).
 */
export type LiveState = 'done' | 'cancelled' | 'no_show' | 'needs_answer' | 'in_service' | 'later';

/**
 * Jira GRW-222 — how long past its booked end a visit still counts as in the chair.
 *
 * The owner's case: a 15-minute beard trim, then the stylist sells a facial and
 * a haircut, and the extra services are only added at the till. By the clock
 * the visit ended at 10:15; in the room Amit is busy until 11:00. So a visit
 * stays "Here now" until it is PAID — with this ceiling, because a booking
 * nobody ever settled must not sit on the front desk's screen all day.
 */
export const STILL_IN_CHAIR_MIN = 60;

/** Jira GRW-222 BR-15 — "Not marked done yet" waits this long past the booked end, so an upsold visit still running is not flagged. */
export const NOT_MARKED_GRACE_MIN = 30;

const MIN = 60_000;

function unsettled(group: Pick<BookingGroup, 'appointments'>): boolean {
  // Checkout settles ONE leg of a multi-service sitting (see visitNeedsAnswer),
  // so one completed leg means somebody dealt with the visit.
  return group.appointments.every((a) => a.status === 'confirmed');
}

export function liveState(group: Pick<BookingGroup, 'appointments' | 'startAt' | 'endAt' | 'status'>, now: Date): LiveState {
  if (group.status === 'cancelled') return 'cancelled';
  if (group.status === 'no_show') return 'no_show';
  if (!unsettled(group)) return 'done';
  const t = now.getTime();
  if (new Date(group.startAt).getTime() > t) return 'later';
  return t < new Date(group.endAt).getTime() + STILL_IN_CHAIR_MIN * MIN ? 'in_service' : 'needs_answer';
}

/** In the chair past its booked end — the amber "longer than booked". */
export function longerThanBooked(group: Pick<BookingGroup, 'endAt'>, now: Date): boolean {
  return now.getTime() > new Date(group.endAt).getTime();
}

/** The "Not marked done yet" count's rule: unsettled, and past the booked end by the grace. */
export function countsAsNotMarked(group: Pick<BookingGroup, 'appointments' | 'endAt' | 'status'>, now: Date): boolean {
  if (group.status === 'cancelled' || group.status === 'no_show' || !unsettled(group)) return false;
  return now.getTime() >= new Date(group.endAt).getTime() + NOT_MARKED_GRACE_MIN * MIN;
}

/** Whole minutes from `from` to `to`, never negative. */
export function minutesBetween(from: string | Date, to: string | Date): number {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
}

/**
 * The stylist's current and next visit.
 *
 * Current is the visit whose booked time is now; if two overlap (a walk-in on
 * a busy chair, GRW-199), the one that started first. Next is the earliest
 * visit that has not started and is still on.
 */
export function currentAndNext<T extends Pick<BookingGroup, 'appointments' | 'startAt' | 'endAt' | 'status'>>(groups: T[], now: Date): { current: T | null; next: T | null } {
  const sorted = [...groups].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const current = sorted.find((g) => liveState(g, now) === 'in_service') ?? null;
  const next = sorted.find((g) => liveState(g, now) === 'later') ?? null;
  return { current, next };
}
