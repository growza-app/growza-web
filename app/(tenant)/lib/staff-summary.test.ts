import { describe, expect, it } from 'vitest';
import { staffRows } from './staff-summary';
import type { BookingGroup } from './appointment-display';

/** Jira GRW-343 */
const NOW = new Date('2026-09-20T10:00:00Z');
const at = (h: number, m = 0) => `2026-09-20T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
let n = 0;
const leg = (provider: string, start: string, end: string, status = 'confirmed', service = 'Haircut') => ({ id: `leg-${++n}`, providerName: provider, startAt: start, endAt: end, status, serviceName: service }) as never;
const group = (legs: unknown[], status: BookingGroup['status'] = 'confirmed', extra: Record<string, unknown> = { customerName: 'Vikram Nair' }): BookingGroup => ({ key: Math.random().toString(), appointments: legs, status, startAt: (legs[0] as { startAt: string }).startAt, ...extra }) as unknown as BookingGroup;

describe('the staff table', () => {
  const groups = [
    group([leg('Arjun', at(9), at(9, 30), 'completed')], 'completed'),
    group([leg('Arjun', at(11), at(12))]),
    group([leg('Kavita', at(10, 30), at(11, 15))]),
  ];

  it('counts each person\'s bookings and the minutes on their chair', () => {
    const { staff } = staffRows(groups, ['Arjun', 'Kavita', 'Rohit'], NOW, true);
    expect(staff.map((s) => [s.name, s.bookings, s.bookedMin])).toEqual([['Arjun', 2, 90], ['Kavita', 1, 45], ['Rohit', 0, 0]]);
  });

  it('"Everyone" is the day\'s totals, counting a booking once', () => {
    const { everyone } = staffRows(groups, ['Arjun', 'Kavita'], NOW, true);
    expect(everyone.bookings).toBe(3);
    expect(everyone.bookedMin).toBe(135);
  });

  it('today, "next" is the next visit still to come — not one already done', () => {
    const { staff, everyone } = staffRows(groups, ['Arjun', 'Kavita'], NOW, true);
    expect(staff[0]!.nextAt).toBe(at(11)); // Arjun's 9:00 is done
    expect(staff[1]!.nextAt).toBe(at(10, 30));
    expect(everyone.nextAt).toBe(at(10, 30));
  });

  it('on another day it is simply the first visit of the day', () => {
    const { staff } = staffRows(groups, ['Arjun'], NOW, false);
    expect(staff[0]!.nextAt).toBe(at(9));
  });

  it('a person with nothing on has nothing next', () => {
    expect(staffRows(groups, ['Rohit'], NOW, true).staff[0]!.nextAt).toBeNull();
  });

  it('ignores cancellations and no-shows — they hold no chair', () => {
    const more = [...groups, group([leg('Arjun', at(14), at(15), 'cancelled')], 'cancelled'), group([leg('Arjun', at(15), at(16), 'no_show')], 'no_show')];
    const { staff, everyone } = staffRows(more, ['Arjun'], NOW, true);
    expect(staff[0]!.bookings).toBe(2);
    expect(everyone.bookings).toBe(3);
  });

  it('a visit split across two people is one booking for each and only their own minutes', () => {
    const split = group([leg('Arjun', at(12), at(12, 30)), leg('Kavita', at(12, 30), at(13, 15))]);
    const { staff, everyone } = staffRows([split], ['Arjun', 'Kavita'], NOW, true);
    expect(staff.map((s) => [s.bookings, s.bookedMin])).toEqual([[1, 30], [1, 45]]);
    expect(everyone.bookings).toBe(1);
    expect(everyone.bookedMin).toBe(75);
  });

  it('no bookings at all is all zeros, not an error', () => {
    const { everyone, staff } = staffRows([], ['Arjun'], NOW, true);
    expect(everyone).toMatchObject({ bookings: 0, bookedMin: 0, nextAt: null });
    expect(staff[0]).toMatchObject({ bookings: 0, bookedMin: 0, nextAt: null });
  });

  describe('who each visit is for', () => {
    it('lists a person\'s visits earliest first, each with the client and the service', () => {
      const rows = staffRows(
        [
          group([leg('Arjun', at(15), at(16), 'confirmed', 'Colour')], 'confirmed', { customerName: 'Meera Iyer' }),
          group([leg('Arjun', at(11), at(11, 30))], 'confirmed', { customerName: 'Vikram Nair' }),
        ],
        ['Arjun'],
        NOW,
        true,
      );
      expect(rows.staff[0]!.visits.map((v) => [v.startAt, v.client, v.service])).toEqual([[at(11), 'Vikram Nair', 'Haircut'], [at(15), 'Meera Iyer', 'Colour']]);
    });

    it('a walk-in nobody took a name for reads "Unknown"', () => {
      const rows = staffRows([group([leg('Arjun', at(11), at(12))], 'confirmed', { customerName: null })], ['Arjun'], NOW, true);
      expect(rows.staff[0]!.visits[0]!.client).toBe('Unknown');
    });

    it('a salon that withholds the client from staff gives NO name — never a placeholder', () => {
      const rows = staffRows([group([leg('Arjun', at(11), at(12))], 'confirmed', {})], ['Arjun'], NOW, true);
      expect(rows.staff[0]!.visits[0]!.client).toBeNull();
    });

    it('a split visit lists only the person\'s own leg', () => {
      const split = group([leg('Arjun', at(12), at(12, 30), 'confirmed', 'Haircut'), leg('Kavita', at(12, 30), at(13, 15), 'confirmed', 'Facial')]);
      const { staff } = staffRows([split], ['Arjun', 'Kavita'], NOW, true);
      expect(staff.map((s) => s.visits.map((v) => v.service))).toEqual([['Haircut'], ['Facial']]);
    });

    it('lists nothing for someone with nothing on, and nothing cancelled for anyone', () => {
      const rows = staffRows([...groups, group([leg('Arjun', at(14), at(15), 'cancelled')], 'cancelled')], ['Arjun', 'Rohit'], NOW, true);
      expect(rows.staff[1]!.visits).toEqual([]);
      expect(rows.staff[0]!.visits).toHaveLength(2);
    });
  });
});
