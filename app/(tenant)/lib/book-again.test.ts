import { describe, expect, it } from 'vitest';
import { lastVisitOf, nextFreeTimes } from './book-again';
import type { Appointment, AvailabilityResponse } from './api-types';

/** Jira GRW-341 */
const NOW = new Date('2026-09-20T10:00:00Z');
const appt = (o: Partial<Appointment>): Appointment =>
  ({
    id: 'a',
    startAt: '2026-09-10T05:00:00Z',
    endAt: '2026-09-10T05:30:00Z',
    status: 'completed',
    serviceId: 's1',
    providerId: 'p1',
    bookingGroupId: null,
    offerTitle: null,
    ...o,
  }) as Appointment;

describe('the visit to book again', () => {
  it('is the most recent visit that happened', () => {
    const v = lastVisitOf([appt({ id: 'old', startAt: '2026-08-01T05:00:00Z', serviceId: 's9' }), appt({ id: 'new', serviceId: 's2' })], NOW);
    expect(v?.serviceIds).toEqual(['s2']);
    expect(v?.providerId).toBe('p1');
  });

  it('is nothing for a client who has never been', () => {
    expect(lastVisitOf([], NOW)).toBeNull();
  });

  it('ignores cancellations and no-shows, even when they are the newest row', () => {
    const v = lastVisitOf([appt({ id: 'x', status: 'cancelled', startAt: '2026-09-15T05:00:00Z', serviceId: 's8' }), appt({ id: 'y', status: 'no_show', startAt: '2026-09-16T05:00:00Z', serviceId: 's7' }), appt({ serviceId: 's2' })], NOW);
    expect(v?.serviceIds).toEqual(['s2']);
  });

  it('ignores a booking that has not happened yet', () => {
    expect(lastVisitOf([appt({ startAt: '2026-09-25T05:00:00Z' })], NOW)).toBeNull();
  });

  it('counts a past booking nobody marked done — a desk that never taps Done still has a history', () => {
    expect(lastVisitOf([appt({ status: 'confirmed' })], NOW)?.serviceIds).toEqual(['s1']);
  });

  it('takes every service of a multi-service visit, in running order, and who did the first', () => {
    const v = lastVisitOf(
      [
        appt({ id: '2', bookingGroupId: 'g', serviceId: 'beard', providerId: 'p2', startAt: '2026-09-10T05:30:00Z' }),
        appt({ id: '1', bookingGroupId: 'g', serviceId: 'cut', providerId: 'p1', startAt: '2026-09-10T05:00:00Z' }),
        appt({ id: 'other', serviceId: 'colour', startAt: '2026-09-05T05:00:00Z' }),
      ],
      NOW,
    );
    expect(v?.serviceIds).toEqual(['cut', 'beard']);
    expect(v?.providerId).toBe('p1');
  });

  it('remembers that it was a combo, and a visit with no stylist', () => {
    const v = lastVisitOf([appt({ offerTitle: 'Groom combo', providerId: null })], NOW);
    expect(v?.offerTitle).toBe('Groom combo');
    expect(v?.providerId).toBeNull();
  });
});

const day = (slots: string[]): AvailabilityResponse =>
  ({ slotCount: slots.length, sections: [{ section: 'x', slots: slots.map((l) => ({ utc: `utc-${l}`, local: l, assignedProviderId: null })) }] }) as AvailabilityResponse;

describe('the next free times', () => {
  it('takes the earliest three, and stops asking once it has them', async () => {
    const asked: string[] = [];
    const out = await nextFreeTimes(['d1', 'd2', 'd3'], 3, async (d) => {
      asked.push(d);
      return day(['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM']);
    });
    expect(out.map((t) => t.local)).toEqual(['9:00 AM', '9:30 AM', '10:00 AM']);
    expect(asked).toEqual(['d1']);
  });

  it('carries on to the next day when today has fewer than three', async () => {
    const out = await nextFreeTimes(['d1', 'd2'], 3, async (d) => (d === 'd1' ? day(['4:30 PM']) : day(['9:00 AM', '9:30 AM'])));
    expect(out.map((t) => `${t.day} ${t.local}`)).toEqual(['d1 4:30 PM', 'd2 9:00 AM', 'd2 9:30 AM']);
  });

  it('is empty — not an error — when nothing is free all week', async () => {
    expect(await nextFreeTimes(['d1', 'd2'], 3, async () => day([]))).toEqual([]);
  });

  it('skips a day that failed and still offers what it found', async () => {
    const out = await nextFreeTimes(['d1', 'd2'], 3, async (d) => {
      if (d === 'd1') throw new Error('down');
      return day(['9:00 AM']);
    });
    expect(out).toHaveLength(1);
  });

  it('throws when it could not look at all, so "no free time" is never a guess', async () => {
    await expect(nextFreeTimes(['d1', 'd2'], 3, async () => Promise.reject(new Error('down')))).rejects.toThrow();
  });
});
