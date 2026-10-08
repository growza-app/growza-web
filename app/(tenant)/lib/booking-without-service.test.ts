import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from './dashboard-root';
import { lastVisitOf } from './book-again';
import type { Appointment } from './api';

/**
 * A booking whose service the owner has since deleted keeps its own name and price, and its `serviceId` is null.
 * Nothing that needs a service to look up — moving it, booking it again — may be offered for it.
 */
const leg = (over: Partial<Appointment>): Appointment =>
  ({ id: 'a', status: 'completed', startAt: '2026-10-01T10:00:00Z', bookingGroupId: null, providerId: null, offerTitle: null, serviceId: 's1', ...over }) as Appointment;

describe('a booking whose service was deleted', () => {
  it('is left out of "book again" rather than offered with no service', () => {
    const visit = lastVisitOf([leg({ id: 'x', serviceId: null })], new Date('2026-10-08T00:00:00Z'));
    expect(visit?.serviceIds).toEqual([]);
  });

  it('keeps the services that still exist when only one leg of the visit lost its service', () => {
    const visit = lastVisitOf(
      [leg({ id: 'x', bookingGroupId: 'g', serviceId: null }), leg({ id: 'y', bookingGroupId: 'g', serviceId: 's2', startAt: '2026-10-01T10:30:00Z' })],
      new Date('2026-10-08T00:00:00Z'),
    );
    expect(visit?.serviceIds).toEqual(['s2']);
  });

  it('cannot be moved: the sheet withholds Move when any leg has no service', () => {
    const sheet = readFileSync(fromDashboard('app/(tenant)/components/BookingSheet.tsx'), 'utf-8');
    expect(sheet).toMatch(/\(comboLegs \?\? \[appointment\]\)\.every\(\(l\) => l\.serviceId !== null\)/);
  });
});
