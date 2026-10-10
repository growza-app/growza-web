import { describe, expect, it } from 'vitest';
import { groupBookings, statusChip } from './appointment-display';
import type { Appointment } from './api';

/**
 * Owner-app audit, 2026-10-10 — a move retires the old slot as `cancelled`; the list calls it Moved and says where
 * the booking is now, instead of a "Cancelled" card beside the visit at its new time.
 */
const leg = (over: Partial<Appointment>): Appointment =>
  ({
    id: 'a1',
    startAt: '2026-10-10T09:30:00.000Z',
    endAt: '2026-10-10T10:00:00.000Z',
    status: 'cancelled',
    createdVia: 'dashboard',
    serviceName: 'Haircut',
    priceMinor: '30000',
    bookingGroupId: null,
    reminderSent: false,
    customerIsNew: false,
    offerTitle: null,
    movedTo: null,
    ...over,
  }) as Appointment;

describe('a moved booking', () => {
  it('is Moved, not Cancelled', () => {
    expect(statusChip(leg({ movedTo: '2026-10-10T11:30:00.000Z' })).key).toBe('moved');
    expect(statusChip(leg({})).key).toBe('cancelled');
  });

  it('a combo is Moved only when every leg was moved, and points at the first leg’s new time', () => {
    const g = 'g1';
    const moved = groupBookings([
      leg({ id: 'a', bookingGroupId: g, movedTo: '2026-10-10T11:30:00.000Z' }),
      leg({ id: 'b', bookingGroupId: g, startAt: '2026-10-10T10:00:00.000Z', movedTo: '2026-10-10T12:00:00.000Z' }),
    ])[0]!;
    expect(moved.movedTo).toBe('2026-10-10T11:30:00.000Z');

    const half = groupBookings([leg({ id: 'a', bookingGroupId: g, movedTo: '2026-10-10T11:30:00.000Z' }), leg({ id: 'b', bookingGroupId: g })])[0]!;
    expect(half.movedTo).toBeNull();
  });
});
