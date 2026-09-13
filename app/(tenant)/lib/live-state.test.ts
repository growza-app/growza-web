import { describe, expect, it } from 'vitest';
import type { Appointment } from './api-types';
import { groupBookings } from './appointment-display';
import { countsAsNotMarked, currentAndNext, liveState, longerThanBooked, minutesBetween } from './live-state';

/**
 * Jira GRW-222 — the clock-derived labels on the front-desk and stylist Homes.
 * AC-03 is the stylist's current/next; the rest pin what each label may claim.
 */

let n = 0;
function appt(start: string, end: string, status: Appointment['status'] = 'confirmed', extra: Partial<Appointment> = {}): Appointment {
  n += 1;
  return {
    id: `a${n}`,
    startAt: start,
    endAt: end,
    status,
    createdVia: 'dashboard',
    customerName: `Client ${n}`,
    customerPhone: null,
    serviceId: 's1',
    serviceName: 'Haircut',
    priceMinor: '50000',
    paidAmountMinor: null,
    paymentMode: null,
    providerId: 'p1',
    providerName: 'Amit',
    reminderSent: false,
    customerIsNew: false,
    bookingGroupId: null,
    offerTitle: null,
    comboPriceMinor: null,
    ...extra,
  };
}

const at = (hhmm: string) => new Date(`2026-09-13T${hhmm}:00+05:30`);
const iso = (hhmm: string) => at(hhmm).toISOString();

describe('liveState', () => {
  it('is "in service" while the booked time is now, and says nothing about arrival', () => {
    const [g] = groupBookings([appt(iso('09:00'), iso('09:45'))]);
    expect(liveState(g!, at('09:20'))).toBe('in_service');
  });

  it('is "later" before the booked time', () => {
    const [g] = groupBookings([appt(iso('10:00'), iso('10:30'))]);
    expect(liveState(g!, at('09:59'))).toBe('later');
  });

  it('stays in the chair past its booked end, for an upsell nobody has billed yet (AC-12)', () => {
    const [g] = groupBookings([appt(iso('10:00'), iso('10:15'))]);
    expect(liveState(g!, at('10:40'))).toBe('in_service');
    expect(longerThanBooked(g!, at('10:40'))).toBe(true);
    expect(countsAsNotMarked(g!, at('10:40')), 'not flagged inside the 30-minute grace').toBe(false);
    expect(countsAsNotMarked(g!, at('10:45'))).toBe(true);
  });

  it('leaves Here now an hour past its booked end (boundary)', () => {
    const [g] = groupBookings([appt(iso('10:00'), iso('10:15'))]);
    expect(liveState(g!, at('11:14'))).toBe('in_service');
    expect(liveState(g!, at('11:15'))).toBe('needs_answer');
  });

  it('a sitting with one leg paid is done, not unmarked (checkout settles one leg)', () => {
    const legs = groupBookings([
      appt(iso('09:00'), iso('09:30'), 'completed', { bookingGroupId: 'g1' }),
      appt(iso('09:30'), iso('10:00'), 'confirmed', { bookingGroupId: 'g1' }),
    ]);
    expect(liveState(legs[0]!, at('11:00'))).toBe('done');
  });

  it('cancelled and no-show say so whatever the time', () => {
    const [c] = groupBookings([appt(iso('09:00'), iso('09:45'), 'cancelled')]);
    const [x] = groupBookings([appt(iso('09:00'), iso('09:45'), 'no_show')]);
    expect(liveState(c!, at('09:20'))).toBe('cancelled');
    expect(liveState(x!, at('09:20'))).toBe('no_show');
  });
});

describe('AC-03 — a stylist sees their current and next client', () => {
  it('9:00–9:45 is current and 10:00 is next, at 9:20', () => {
    const groups = groupBookings([appt(iso('09:00'), iso('09:45')), appt(iso('10:00'), iso('10:30'))]);
    const { current, next } = currentAndNext(groups, at('09:20'));
    expect(current?.startAt).toBe(iso('09:00'));
    expect(next?.startAt).toBe(iso('10:00'));
    expect(minutesBetween(current!.startAt, at('09:20'))).toBe(20);
    expect(minutesBetween(at('09:20'), next!.startAt)).toBe(40);
  });

  it('nobody current once the last visit is well past, and nobody next', () => {
    const groups = groupBookings([appt(iso('09:00'), iso('09:45'))]);
    expect(currentAndNext(groups, at('10:50'))).toEqual({ current: null, next: null });
  });

  it('a cancelled visit is never next', () => {
    const groups = groupBookings([appt(iso('10:00'), iso('10:30'), 'cancelled'), appt(iso('11:00'), iso('11:30'))]);
    expect(currentAndNext(groups, at('09:00')).next?.startAt).toBe(iso('11:00'));
  });
});

describe('initials', () => {
  it('skips symbols, so a bracketed note is not an initial', async () => {
    const { initials } = await import('./appointment-display');
    expect(initials('Simran (test)')).toBe('ST');
    expect(initials('Aditya Prasad')).toBe('AP');
    expect(initials('(walk-in)')).toBe('W');
    expect(initials('  ')).toBe('?');
    expect(initials(null)).toBe('?');
  });
});
