import type { Appointment, AvailabilityResponse } from './api-types';

/**
 * Jira GRW-341 — "Book again": what a returning client had last time, and the next times it would fit.
 * Pure, so the rules are tested without a browser.
 */

export interface LastVisit {
  /** Every service of that visit, in running order. Repeats are kept: two haircuts is two haircuts. */
  serviceIds: string[];
  /** Who did the first service; null when it was recorded with no stylist. */
  providerId: string | null;
  /** Set when the visit was a combo, so the same combo can be offered again. */
  offerTitle: string | null;
  startAt: string;
}

/**
 * The visit to offer again: the client's most recent one that HAPPENED.
 *
 * A cancelled booking and a no-show are not a visit. A future booking has not happened yet. A past booking still
 * marked `confirmed` counts — a desk that never taps "Done" has clients whose real history is all `confirmed`, and
 * refusing them would make the feature vanish for exactly the salons that need the shortcut most.
 *
 * A multi-service visit is several rows sharing `bookingGroupId`; they are returned together.
 */
export function lastVisitOf(appointments: readonly Appointment[], now: Date): LastVisit | null {
  const happened = appointments
    .filter((a) => (a.status === 'completed' || a.status === 'confirmed') && new Date(a.startAt).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  const newest = happened[0];
  if (!newest) return null;

  const legs = newest.bookingGroupId
    ? happened.filter((a) => a.bookingGroupId === newest.bookingGroupId).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    : [newest];
  return {
    serviceIds: legs.map((l) => l.serviceId),
    providerId: legs[0]?.providerId ?? null,
    offerTitle: legs.find((l) => l.offerTitle)?.offerTitle ?? null,
    startAt: legs[0]!.startAt,
  };
}

export interface FreeTime {
  /** The local day, `YYYY-MM-DD`. */
  day: string;
  utc: string;
  /** "4:30 PM", in the business's time. */
  local: string;
}

/**
 * The next `count` free times over the coming days, earliest first.
 *
 * Days are asked one at a time and the search stops as soon as there are enough, so the usual case is one request.
 * A day that fails is skipped; only when NOTHING was found and something failed does this throw — an empty answer
 * must mean "no free time", never "we could not look".
 */
export async function nextFreeTimes(
  days: readonly string[],
  count: number,
  fetchDay: (day: string) => Promise<AvailabilityResponse>,
): Promise<FreeTime[]> {
  const found: FreeTime[] = [];
  let failures = 0;
  for (const day of days) {
    if (found.length >= count) break;
    try {
      const res = await fetchDay(day);
      for (const sec of res.sections) {
        for (const slot of sec.slots) {
          if (found.length < count) found.push({ day, utc: slot.utc, local: slot.local });
        }
      }
    } catch {
      failures += 1;
    }
  }
  if (found.length === 0 && failures > 0) throw new Error('could not look for free times');
  return found;
}
