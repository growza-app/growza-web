import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { groupBookings } from '../lib/appointment-display';
import type { Appointment } from '../lib/api-types';

/**
 * QA 2026-11-06 — a client booked twice at one time is said on BOTH bookings.
 *
 * The API puts `clientAlsoBooked` on each of the two rows of the day's list. This pins the list's half: a booking
 * carries it through grouping, and the card and the table row both say "Also booked at … with …".
 */
const list = readFileSync(resolve(__dirname, 'BookingsList.tsx'), 'utf8');
const css = readFileSync(resolve(__dirname, '../styles/07-chips.css'), 'utf8');
const words = (file: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../messages', file), 'utf8')).status as Record<string, string>;

const leg = (over: Partial<Appointment>): Appointment =>
  ({
    id: 'a1',
    startAt: '2026-11-09T05:30:00.000Z',
    endAt: '2026-11-09T06:00:00.000Z',
    status: 'confirmed',
    createdVia: 'dashboard',
    serviceId: 's1',
    serviceName: 'Haircut',
    priceMinor: '30000',
    providerId: 'p1',
    providerName: 'Priya',
    bookingGroupId: null,
    offerId: null,
    offerTitle: null,
    reminderSent: false,
    customerIsNew: false,
    ...over,
  }) as Appointment;

describe('a booking carries the note through grouping', () => {
  const also = { startAt: '2026-11-09T05:30:00.000Z', staffName: 'Fatima' };

  it('a single booking that has one keeps it', () => {
    expect(groupBookings([leg({ clientAlsoBooked: also })])[0]!.alsoBooked).toEqual(also);
  });

  it('a visit of two services says it when EITHER service overlaps the other booking', () => {
    const [visit] = groupBookings([
      leg({ id: 'a1', bookingGroupId: 'g1', clientAlsoBooked: null }),
      leg({ id: 'a2', bookingGroupId: 'g1', startAt: '2026-11-09T06:00:00.000Z', endAt: '2026-11-09T06:45:00.000Z', clientAlsoBooked: also }),
    ]);
    expect(visit!.alsoBooked).toEqual(also);
  });

  it('a booking with none, and one from an API that does not send the field, say nothing', () => {
    expect(groupBookings([leg({ clientAlsoBooked: null })])[0]!.alsoBooked).toBeNull();
    expect(groupBookings([leg({})])[0]!.alsoBooked).toBeNull();
  });
});

describe('the list says it', () => {
  it('on the phone card and on the desktop row', () => {
    expect(list.match(/\{b\.alsoBooked \? <div className="bk-card-also">\{alsoLine\(b\.alsoBooked\)\}<\/div> : null\}/g)).toHaveLength(2);
  });

  it('with the time in the salon’s zone, and the colleague’s name when there is one', () => {
    expect(list).toMatch(/const time = formatTime\(also\.startAt, timezone\);/);
    expect(list).toMatch(/also\.staffName \? ts\('alsoAtWith', \{ time, staff: also\.staffName \}\) : ts\('alsoAt', \{ time \}\)/);
  });

  it('in a colour that reads as "look at this", from a token, at a size set in rem', () => {
    const rule = css.slice(css.indexOf('.bk-card-also {'), css.indexOf('}', css.indexOf('.bk-card-also {')));
    expect(rule).toMatch(/color: var\(--amber-ink\);/);
    expect(rule).toMatch(/font-size: 0\.8125rem;/);
  });

  it('in English and in Hindi', () => {
    expect(words('en.json').alsoAtWith).toBe('Also booked at {time} with {staff}');
    expect(words('en.json').alsoAt).toBe('Also booked at {time}');
    for (const key of ['alsoAt', 'alsoAtWith']) expect(words('hi.json')[key]).toContain('{time}');
    expect(words('hi.json').alsoAtWith).toContain('{staff}');
  });
});
