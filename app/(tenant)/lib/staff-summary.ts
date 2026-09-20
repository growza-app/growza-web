import { clientNameLabel, type BookingGroup } from './appointment-display';

/**
 * Jira GRW-343 — one row of the Bookings staff table: what a person has on for the day, at a glance.
 * Pure, so the arithmetic is tested without a browser.
 */
/** One visit on a person's chair — a line in the table's expanded section. */
export interface StaffVisit {
  key: string;
  startAt: string;
  endAt: string;
  status: BookingGroup['status'];
  service: string;
  /** Whose chair it is on — so the sheet for "Everyone" can say who each visit is with. */
  staff: string | null;
  /**
   * The client's name, "Unknown" for a walk-in nobody took a name for, or NULL when the salon withholds who the
   * booking is for (GRW-166) — in which case the line shows the service and never a placeholder name.
   */
  client: string | null;
}

export interface StaffRow {
  name: string;
  /** Bookings they are in: a multi-service visit is one booking, however many of its legs are theirs. */
  bookings: number;
  /** Minutes on their chair — only the legs that are theirs, so a split combo is shared out fairly. */
  bookedMin: number;
  /** The next visit still to come (today), or the first of the range (any other day). Null when there is none. */
  nextAt: string | null;
  /** Every visit that is theirs, earliest first — with who it is for. */
  visits: StaffVisit[];
}

/** A booking that is taking, or took, the chair. A cancellation and a no-show hold nothing. */
const holdsTheChair = (status: BookingGroup['status']) => status === 'confirmed' || status === 'completed';

const minutesOf = (startAt: string, endAt: string) => Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000));

/**
 * `upcomingOnly` is "today": the answer to "who is free next" is a visit that has not started, not one that has.
 * For another day, or a range, "next" would always be empty or meaningless, so it is the first visit instead.
 */
export function staffRows(groups: readonly BookingGroup[], staffNames: readonly string[], now: Date, upcomingOnly: boolean): { everyone: StaffRow; staff: StaffRow[] } {
  const live = groups.filter((g) => holdsTheChair(g.status));

  const rowFor = (name: string | null): StaffRow => {
    let bookings = 0;
    let bookedMin = 0;
    let nextAt: string | null = null;
    const visits: StaffVisit[] = [];
    for (const g of live) {
      const legs = name === null ? g.appointments : g.appointments.filter((a) => a.providerName === name);
      if (legs.length === 0) continue;
      bookings += 1;
      for (const leg of legs) {
        visits.push({ key: leg.id, startAt: leg.startAt, endAt: leg.endAt, status: leg.status, service: leg.serviceName, staff: leg.providerName ?? null, client: clientNameLabel(g) });
        bookedMin += minutesOf(leg.startAt, leg.endAt);
        const counts = !upcomingOnly || (leg.status === 'confirmed' && new Date(leg.startAt).getTime() >= now.getTime());
        if (counts && (nextAt === null || new Date(leg.startAt).getTime() < new Date(nextAt).getTime())) nextAt = leg.startAt;
      }
    }
    visits.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return { name: name ?? '', bookings, bookedMin, nextAt, visits };
  };

  return { everyone: rowFor(null), staff: staffNames.map((n) => rowFor(n)) };
}
