import { copy } from './copy';
import type { Appointment } from './api';

/** Shared with the dashboard's "today" list so a booking's status reads identically everywhere it appears. */
export function statusChip(appt: Pick<Appointment, 'status' | 'reminderSent' | 'createdVia'>) {
  if (appt.status === 'completed') return { cls: 'chip-completed', text: copy.status.done };
  if (appt.status === 'no_show') return { cls: 'chip-no_show', text: copy.status.didNotCome };
  if (appt.status === 'cancelled') return { cls: 'chip-cancelled', text: copy.status.cancelled };
  // A confirmed booking whose reminder already went out shows that instead —
  // a derived display state, never a DB status (07-product-surfaces.md §1.2).
  if (appt.reminderSent) return { cls: 'chip-reminder', text: copy.status.reminded };
  if (appt.createdVia === 'dashboard') return { cls: 'chip-new', text: copy.status.walkIn };
  return { cls: 'chip-confirmed', text: copy.status.confirmed };
}

export function initials(name: string | null): string {
  /*
   * Letters and digits only, in any script. "Simran (test)" read "S(" — the
   * bracket was the first character of the second word. `\p{L}` keeps a
   * Devanagari or Tamil name's first letter, which `[A-Za-z]` would drop.
   */
  const words = (name ?? '')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0]!.toUpperCase())
    .join('');
}

/**
 * A compact service line for a booking: up to three services listed in full,
 * then "+ N more" — so a 6-service combo reads "Haircut + Facial + De-Tan + 3
 * more" instead of a runaway line. The checkout lists every service in full.
 */
export function summarizeServices(names: string[]): string {
  if (names.length <= 3) return names.join(' + ');
  return `${names.slice(0, 3).join(' + ')} + ${names.length - 3} more`;
}

/** "30 min", "1h", "1h 30m" — a booking's total time in plain words. */
export function formatDuration(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Tomorrow's date in the tenant's own timezone, not the device's — matches how every other date in this dashboard is computed. Shared by the mobile FAB menu and the desktop quick-actions panel, which offer the same "book for later" shortcut. */
export function tomorrowInTimezone(timezone: string): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(tomorrow);
}

/** "in 25m", "in 2h 15m", "5m ago" — how far a booking's start time is from now. */
export function relativeCountdown(startISO: string, now: Date): string {
  const diffMin = Math.round((new Date(startISO).getTime() - now.getTime()) / 60000);
  if (diffMin <= 0) return diffMin === 0 ? 'now' : `${formatDuration(Math.min(-diffMin, 24 * 60))} ago`;
  return `in ${formatDuration(Math.min(diffMin, 24 * 60))}`;
}

/**
 * One booking the owner actually made — collapsing the per-service legs of a
 * combo/multi-service booking (same `bookingGroupId`) into a single item.
 * A plain single-service booking is a group of one.
 */
export interface BookingGroup {
  /** Stable key: the shared group id, or the lone appointment's id. */
  key: string;
  /** Legs, earliest first. */
  appointments: Appointment[];
  startAt: string;
  endAt: string;
  /** Total booked time = the sum of every leg's duration (e.g. 30 + 45 + 15 = 90). */
  totalMin: number;
  /**
   * GRW-166 — OPTIONAL, and the distinction matters when rendering.
   *
   * ABSENT means the salon withholds the client's identity from staff.
   * `customerName: null` means a client with no name on file. The card shows
   * nothing for the first and "Unknown" for the second, so collapsing them
   * into one nullable field would put a placeholder where the answer is
   * "you may not see this".
   */
  customerName?: string | null;
  customerPhone?: string | null;
  /** Every service in the booking, in order — e.g. ["Haircut", "Facial", "De-Tan"]. */
  serviceNames: string[];
  /** Distinct providers across the legs (a combo may split staff). */
  providerNames: string[];
  status: Appointment['status'];
  createdVia: Appointment['createdVia'];
  reminderSent: boolean;
  priceMinor: number;
  /** True when the booking has more than one service (grouped display). */
  isCombo: boolean;
  /** The offer/combo package's name, if the customer booked one — null for plain (multi-)service bookings. This is what marks a booking as a real "combo". */
  offerTitle: string | null;
}

/**
 * A combo's legs can end up with genuinely different outcomes — e.g. the
 * owner cancels just one service in a 4-service combo while the rest go
 * on to no-show. Priority order, most-needs-attention first:
 *   confirmed > no_show > cancelled > completed
 * "completed" is only returned when every leg actually completed — it must
 * be checked LAST, not used as a catch-all default, or a combo where
 * nothing actually finished (e.g. 3 no-shows + 1 cancellation, no completed
 * legs at all) reads as "Finished" when nothing was.
 */
function groupStatus(legs: Appointment[]): Appointment['status'] {
  const statuses = new Set(legs.map((a) => a.status));
  if (statuses.has('confirmed')) return 'confirmed';
  if (statuses.has('no_show')) return 'no_show';
  if (statuses.has('cancelled')) return 'cancelled';
  return 'completed';
}

/**
 * Jira GRW-214 · GRW-217 — has anybody said what happened to this visit?
 *
 * Exported and pure so the tests exercise THIS function rather than a copy of
 * its rules. It lived inside `BookingsList` as a closure, and the tests that
 * covered it re-derived the predicate locally — so when the bug below was
 * introduced, the behavioural tests all passed against their own correct copy
 * and only a source-text assertion caught it. A rule worth testing is worth
 * exporting.
 *
 * ## Every leg, not the group's status
 *
 * `groupStatus` returns `confirmed` when ANY leg is confirmed, and checkout
 * settles only ONE leg of a multi-service visit: it puts the whole payment on
 * that leg and leaves the rest `confirmed`, which is what stops revenue
 * double-counting — a second `completed` leg would add its own booked price on
 * top of the amount actually taken.
 *
 * So a cut-and-facial checked out for ₹1,100 read as unsettled, and the prompt
 * told the receptionist to go and mark a visit they had just been paid for.
 * Worse for the stylist, whose trust in that prompt is the whole control
 * (GRW-216): chasing an already-settled booking is what teaches them to ignore
 * it.
 *
 * `every`, so a visit needs an answer only when NOTHING has been settled about
 * it. One settled leg means somebody dealt with the sitting.
 *
 * `endAt`, not `startAt`: a visit still running is not overdue.
 */
export function visitNeedsAnswer(group: Pick<BookingGroup, 'appointments' | 'endAt'>, now: Date): boolean {
  return (
    group.appointments.every((a) => a.status === 'confirmed') &&
    new Date(group.endAt).getTime() <= now.getTime()
  );
}

export function groupBookings(appointments: Appointment[]): BookingGroup[] {
  const byGroup = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const key = a.bookingGroupId ?? `single:${a.id}`;
    const list = byGroup.get(key);
    if (list) list.push(a);
    else byGroup.set(key, [a]);
  }

  const groups = [...byGroup.entries()].map(([key, legs]) => {
    const sorted = [...legs].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const totalMin = Math.round(
      sorted.reduce((sum, a) => sum + (new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60000, 0),
    );
    return {
      key,
      appointments: sorted,
      startAt: first.startAt,
      endAt: last.endAt,
      totalMin,
      // Spread conditionally so an absent field STAYS absent through grouping —
      // writing `customerName: first.customerName` would create the key with
      // `undefined`, and `'customerName' in group` would then be true for a
      // client the viewer is not allowed to see.
      ...('customerName' in first ? { customerName: first.customerName } : {}),
      ...('customerPhone' in first ? { customerPhone: first.customerPhone } : {}),
      serviceNames: sorted.map((a) => a.serviceName),
      providerNames: [...new Set(sorted.map((a) => a.providerName).filter((n): n is string => !!n))],
      status: groupStatus(sorted),
      createdVia: first.createdVia,
      reminderSent: sorted.some((a) => a.reminderSent),
      priceMinor: sorted.reduce((sum, a) => sum + Number(a.priceMinor ?? 0), 0),
      isCombo: sorted.length > 1,
      offerTitle: sorted.find((a) => a.offerTitle)?.offerTitle ?? null,
    };
  });

  return groups.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

/**
 * Jira GRW-166 — what to show where a client's name would go.
 *
 * Three cases, and they are genuinely different:
 *
 *   withheld  the salon does not let staff see who the client is → show
 *             nothing, because a placeholder reads as a fault in the product
 *   no name   a walk-in nobody took a name for → "Unknown", which is true
 *   named     the name
 *
 * Absence of the KEY is what separates the first from the second, so this
 * takes the whole booking rather than `booking.customerName`.
 */
export function clientNameLabel(booking: { customerName?: string | null }): string | null {
  if (!('customerName' in booking)) return null;
  return booking.customerName ?? 'Unknown';
}
