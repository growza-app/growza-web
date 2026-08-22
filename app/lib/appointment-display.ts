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
  isCombo: boolean;
}

function groupStatus(legs: Appointment[]): Appointment['status'] {
  // If the legs disagree, the still-live one wins so the owner never loses the
  // action (a half-completed combo still needs finishing); otherwise they match.
  if (legs.some((a) => a.status === 'confirmed')) return 'confirmed';
  const first = legs[0]!.status;
  return legs.every((a) => a.status === first) ? first : 'completed';
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
    };
  });

  return groups.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}
