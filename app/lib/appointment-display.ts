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
  return (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
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
  customerName: string | null;
  customerPhone: string;
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
      customerName: first.customerName,
      customerPhone: first.customerPhone,
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
