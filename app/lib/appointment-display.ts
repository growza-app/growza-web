import { copy } from './copy';
import type { Appointment } from './api';

/** Shared with the dashboard's "today" list so a booking's status reads identically everywhere it appears. */
export function statusChip(appt: Appointment) {
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
