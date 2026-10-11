import type { Appointment } from './api';

/** The `status` message group's keys — the label is looked up where the chip is shown. */
export type StatusKey = 'done' | 'didNotCome' | 'cancelled' | 'moved' | 'reminded' | 'walkIn' | 'confirmed';

/** Shared with the dashboard's "today" list so a booking's status reads identically everywhere it appears. */
export function statusChip(appt: Pick<Appointment, 'status'> & Partial<Pick<Appointment, 'reminderSent' | 'createdVia' | 'movedTo'>>) {
  if (appt.status === 'completed') return { cls: 'chip-completed', key: 'done' as StatusKey };
  if (appt.status === 'no_show') return { cls: 'chip-no_show', key: 'didNotCome' as StatusKey };
  // Owner-app audit, 2026-10-10 — a move retires the old slot as cancelled; it was moved, not called off.
  if (appt.status === 'cancelled' && appt.movedTo) return { cls: 'chip-moved', key: 'moved' as StatusKey };
  if (appt.status === 'cancelled') return { cls: 'chip-cancelled', key: 'cancelled' as StatusKey };
  // A confirmed booking whose reminder already went out shows that instead —
  // a derived display state, never a DB status (07-product-surfaces.md §1.2).
  if (appt.reminderSent) return { cls: 'chip-reminder', key: 'reminded' as StatusKey };
  if (appt.createdVia === 'dashboard') return { cls: 'chip-new', key: 'walkIn' as StatusKey };
  return { cls: 'chip-confirmed', key: 'confirmed' as StatusKey };
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
export function summarizeServices(names: string[], lang: string = 'en'): string {
  if (names.length <= 3) return names.join(' + ');
  // Jira GRW-478 (U-3) — in the page's language: "more" stayed English on a Hindi screen.
  return `${names.slice(0, 3).join(' + ')} + ${names.length - 3} ${lang === 'hi' ? 'और' : 'more'}`;
}

/** "30 min", "1h", "1h 30m" — a booking's total time in plain words. */
export function formatDuration(totalMin: number, lang: string = 'en'): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  // Jira GRW-478 (U-3) — "1h 30m" stayed English on a Hindi screen.
  if (lang === 'hi') {
    if (h === 0) return `${m} मिनट`;
    if (m === 0) return `${h} घंटे`;
    return `${h} घं ${m} मि`;
  }
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
export function relativeCountdown(startISO: string, now: Date, lang: string = 'en'): string {
  const diffMin = Math.round((new Date(startISO).getTime() - now.getTime()) / 60000);
  const span = (min: number) => formatDuration(Math.min(min, 24 * 60), lang);
  if (lang === 'hi') {
    if (diffMin <= 0) return diffMin === 0 ? 'अभी' : `${span(-diffMin)} पहले`;
    return `${span(diffMin)} में`;
  }
  if (diffMin <= 0) return diffMin === 0 ? 'now' : `${span(-diffMin)} ago`;
  return `in ${span(diffMin)}`;
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
  /** Where a moved visit is now: set only when every leg was retired by a move (owner-app audit, 2026-10-10). */
  movedTo: string | null;
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
  // Jira GRW-314 — a visit with a completed service IS a completed visit, whatever else was taken off it
  // (the analytics reads it the same way). A combo or a service cancelled at the till leaves a cancelled
  // leg beside the ones that were done, and this called the whole booking cancelled.
  if (statuses.has('completed')) return 'completed';
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
      // The legs move together, so the first leg's new start is the visit's.
      movedTo: sorted.every((a) => a.status === 'cancelled' && a.movedTo) ? first.movedTo! : null,
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
 *   no name   a walk-in nobody took a name for → "No name", which is true
 *   named     the name
 *
 * Absence of the KEY is what separates the first from the second, so this
 * takes the whole booking rather than `booking.customerName`.
 */
export function clientNameLabel(booking: { customerName?: string | null }): string | null {
  if (!('customerName' in booking)) return null;
  return booking.customerName ?? 'No name';
}


/**
 * Jira GRW-314 — what a booking came to, and what its combo took off.
 *
 * Services cancelled at the till are not part of the bill. And a combo's discount is only still to be
 * taken off for services nobody has been paid for: once a service is paid, its amount already IS its share
 * of the combo price, so taking the discount off again counted it twice (a finished combo read ₹1,860 when
 * ₹2,380 was paid, and one read −₹140). A booking that is wholly cancelled still shows what it was.
 */
export function bookingBill(legs: Appointment[]): { totalMinor: number; savingsMinor: number } {
  const live = legs.filter((a) => a.status !== 'cancelled');
  const counted = live.length > 0 ? live : legs;
  const listOf = (a: Appointment) => Number(a.priceMinor ?? 0);
  const isCombo = (a: Appointment) => Boolean(a.offerTitle && a.comboPriceMinor);
  /*
   * Paid services count at what was paid; an unpaid one outside a combo at its own price. An unpaid service
   * INSIDE a combo takes its share of the combo's price: the price is apportioned over the combo's services
   * by list price (the rule the till and the reports use), and the unpaid ones carry their part of it. So a
   * combo with one service paid and one still to pay comes to what was paid plus the rest of the price, not
   * the unpaid service at its full list price. Each combo is worked out on its own.
   */
  const combos = new Map<string, { price: number; all: number; unpaid: number }>();
  let totalMinor = 0;
  for (const a of counted) {
    if (isCombo(a)) {
      const key = `${a.offerTitle}:${a.comboPriceMinor}`;
      const g = combos.get(key) ?? { price: Number(a.comboPriceMinor), all: 0, unpaid: 0 };
      g.all += listOf(a);
      if (a.paidAmountMinor == null) g.unpaid += listOf(a);
      combos.set(key, g);
    }
    if (a.paidAmountMinor != null) totalMinor += Number(a.paidAmountMinor);
    else if (!isCombo(a)) totalMinor += listOf(a);
  }
  let savingsMinor = 0;
  for (const g of combos.values()) {
    const share = g.all > 0 ? Math.round((g.price * g.unpaid) / g.all) : 0;
    totalMinor += share;
    savingsMinor += Math.max(0, g.unpaid - share);
  }
  return { totalMinor, savingsMinor };
}
