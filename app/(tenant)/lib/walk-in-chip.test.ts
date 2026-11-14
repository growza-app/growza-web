import { describe, expect, it } from 'vitest';
import type { Appointment } from './api';
import { groupBookings, statusChip } from './appointment-display';

/**
 * QA 2026-11-14 — a booking the desk made for Sunday 11:00 (New booking → Pick a time) read "Walk-in" on the
 * Bookings list, as did today's 9:00 and 9:30 made the same way. Every dashboard booking was a walk-in to this chip.
 */
describe('the Walk-in chip is for a walk-in', () => {
  const base = { status: 'confirmed' as const, reminderSent: false, createdVia: 'dashboard' as const, movedTo: null };

  it('a dashboard booking made for later reads as an ordinary booking', () => {
    expect(statusChip({ ...base, bookedAhead: true }).key).toBe('confirmed');
  });

  it('a visit recorded as it happened is still a walk-in', () => {
    expect(statusChip({ ...base, bookedAhead: false }).key).toBe('walkIn');
  });

  it('an older API that sends no bookedAhead keeps the old answer', () => {
    expect(statusChip(base).key).toBe('walkIn');
  });

  it('a WhatsApp booking is unchanged, and a sent reminder still wins', () => {
    expect(statusChip({ ...base, createdVia: 'whatsapp' }).key).toBe('confirmed');
    expect(statusChip({ ...base, bookedAhead: false, reminderSent: true }).key).toBe('reminded');
  });

  it('the grouped list carries it from the first leg, and leaves it absent when the API did not send it', () => {
    const leg = (id: string, bookedAhead?: boolean) =>
      ({ id, bookingGroupId: 'g1', startAt: '2026-11-15T05:30:00.000Z', endAt: '2026-11-15T06:00:00.000Z', status: 'confirmed', createdVia: 'dashboard', reminderSent: false, serviceName: 'Haircut', providerName: 'Priya', priceMinor: '50000', offerTitle: null, comboPriceMinor: null, movedTo: null, ...(bookedAhead === undefined ? {} : { bookedAhead }) }) as unknown as Appointment;
    const [g] = groupBookings([leg('a', true), leg('b', true)]);
    expect(statusChip(g!).key).toBe('confirmed');
    const [old] = groupBookings([leg('c')]);
    expect('bookedAhead' in old!).toBe(false);
  });
});
