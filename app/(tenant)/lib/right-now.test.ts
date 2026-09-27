import { describe, expect, it } from 'vitest';
import type { Appointment } from './api-types';
import { groupBookings } from './appointment-display';
import type { QueueEntry } from './home-types';
import { countsAsNotMarked, minutesBetween, NOT_MARKED_GRACE_MIN } from './live-state';
import { ALERT_AFTER_MIN, ALERTS_SHOWN, atBranch, isOverTime, rightNow, wholeMinutes } from './right-now';

/**
 * Jira GRW-351 — the owner's "Right now" card, worked out from the clock.
 *
 * AC-01 happy path, AC-02 alerts (longest first, "+N more"), AC-03 the 9-minute boundary, AC-04 an unreadable queue,
 * AC-05 the calm line, and the after-closing card that follows tomorrow's list.
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

function waiting(id: string, added: string, extra: Partial<QueueEntry> = {}): QueueEntry {
  return { id, customerId: null, customerName: `Walk-in ${id}`, customerPhone: null, serviceIds: [], serviceNames: [], offerId: null, addedAt: added, tokenNo: 1, ...extra };
}

const at = (hhmm: string, sec = 0) => new Date(`2026-09-26T${hhmm}:${String(sec).padStart(2, '0')}+05:30`);
const iso = (hhmm: string, sec = 0) => at(hhmm, sec).toISOString();
const card = (appointments: Appointment[], queue: QueueEntry[] | null, now: Date, afterClose = false, tomorrow: Appointment[] = []) =>
  rightNow({ today: groupBookings(appointments), tomorrow: groupBookings(tomorrow), queue, now, afterClose });
const room = (n: number, queue: QueueEntry[]) => rightNow({ today: [], tomorrow: null, queue, now: at('10:30'), afterClose: false, room: n });

describe('wholeMinutes', () => {
  it('rounds down, so 9 min 59 s is still 9', () => {
    expect(wholeMinutes(iso('10:00'), iso('10:09', 59))).toBe(9);
    expect(wholeMinutes(iso('10:00'), iso('10:10'))).toBe(10);
  });

  it('is never negative', () => {
    expect(wholeMinutes(iso('10:30'), iso('10:00'))).toBe(0);
  });
});

describe('AC-01 — who is in the chair, and who is next', () => {
  it('a visit booked for now is in the chair; the next starts "in 25 min"', () => {
    const s = card([appt(iso('10:00'), iso('10:45'), 'confirmed', { customerName: 'Priya' }), appt(iso('10:50'), iso('11:20'), 'confirmed', { customerName: 'Neha' })], [], at('10:25'));
    expect(s.inChair?.map((g) => g.customerName)).toEqual(['Priya']);
    expect(s.next?.customerName).toBe('Neha');
    expect(s.nextIsTomorrow).toBe(false);
    expect(minutesBetween(at('10:25'), s.next!.startAt)).toBe(25);
  });

  it('a paid visit is not in the chair, and a cancelled one is not next', () => {
    const s = card(
      [appt(iso('10:00'), iso('10:45'), 'completed'), appt(iso('10:30'), iso('11:00'), 'cancelled'), appt(iso('11:00'), iso('11:30'), 'confirmed', { customerName: 'Neha' })],
      [],
      at('10:20'),
    );
    expect(s.inChair).toEqual([]);
    expect(s.next?.customerName).toBe('Neha');
  });

  it('nothing later today is no next visit, not an error', () => {
    const s = card([appt(iso('09:00'), iso('09:30'), 'completed')], [], at('18:00'));
    expect(s.next).toBeNull();
    expect(s.inChair).toEqual([]);
  });
});

describe('AC-02 — alerts', () => {
  it('a visit 12 minutes past its booked end and unpaid is an alert, naming the minutes', () => {
    const s = card([appt(iso('10:00'), iso('10:30'))], [], at('10:42'));
    expect(s.alerts).toHaveLength(1);
    expect(s.alerts[0]).toMatchObject({ kind: 'over_time', minutes: 12 });
    expect(s.inChair).toHaveLength(1);
  });

  it('a walk-in waiting 10 minutes is an alert', () => {
    const s = card([], [waiting('w1', iso('10:00'))], at('10:10'));
    expect(s.alerts).toEqual([expect.objectContaining({ kind: 'waiting', minutes: 10, key: 'w:w1' })]);
  });

  it('the longest comes first, whatever kind it is', () => {
    const s = card([appt(iso('10:00'), iso('10:30'))], [waiting('w1', iso('10:20')), waiting('w2', iso('10:40'))], at('10:55'));
    // Over time 25, waiting 35, waiting 15.
    expect(s.alerts.map((a) => [a.kind, a.minutes])).toEqual([
      ['waiting', 35],
      ['over_time', 25],
      ['waiting', 15],
    ]);
  });

  it(`shows ${ALERTS_SHOWN}, and counts the rest as "+N more"`, () => {
    const queue = ['09:50', '09:55', '10:00', '10:05', '10:10'].map((t, i) => waiting(`w${i}`, iso(t)));
    const s = card([], queue, at('10:30'));
    expect(s.alerts.map((a) => a.minutes)).toEqual([40, 35, 30]);
    expect(s.moreAlerts).toBe(2);
  });

  it('a laptop with room for one lists the worst and counts the rest', () => {
    const queue = ['09:50', '09:55', '10:00'].map((t, i) => waiting(`w${i}`, iso(t)));
    const one = room(1, queue);
    expect(one.alerts.map((a) => a.minutes)).toEqual([40]);
    expect(one.moreAlerts).toBe(2);
    expect(room(9, queue).alerts).toHaveLength(ALERTS_SHOWN);
  });

  it('with no room to list one, none are listed and all are counted — and "See all" still has every one', () => {
    const queue = ['09:50', '09:55', '10:00', '10:05'].map((t, i) => waiting(`w${i}`, iso(t)));
    const none = room(0, queue);
    expect(none.alerts).toEqual([]);
    expect(none.moreAlerts).toBe(4);
    expect(none.allAlerts.map((a) => a.minutes)).toEqual([40, 35, 30, 25]);
    expect(none.calm).toBe(false);
  });

  it('"See all" lists every alert, worst first, whatever the room', () => {
    const queue = ['09:50', '09:55', '10:00', '10:05', '10:10'].map((t, i) => waiting(`w${i}`, iso(t)));
    expect(room(3, queue).allAlerts.map((a) => a.minutes)).toEqual([40, 35, 30, 25, 20]);
  });

  it('exactly three alerts has no "+N more"', () => {
    const queue = ['09:50', '09:55', '10:00'].map((t, i) => waiting(`w${i}`, iso(t)));
    expect(card([], queue, at('10:30')).moreAlerts).toBe(0);
  });
});

describe('AC-03 — the 10-minute boundary', () => {
  it('9 minutes over its booked end is not an alert', () => {
    expect(card([appt(iso('10:00'), iso('10:30'))], [], at('10:39')).alerts).toEqual([]);
    expect(card([appt(iso('10:00'), iso('10:30'))], [], at('10:39', 59)).alerts).toEqual([]);
  });

  it('a walk-in waiting 9 minutes is not an alert', () => {
    expect(card([], [waiting('w1', iso('10:00'))], at('10:09')).alerts).toEqual([]);
    expect(card([], [waiting('w1', iso('10:00'))], at('10:09', 59)).alerts).toEqual([]);
  });

  it(`${ALERT_AFTER_MIN} minutes is, for both`, () => {
    expect(card([appt(iso('10:00'), iso('10:30'))], [], at('10:40')).alerts).toHaveLength(1);
    expect(card([], [waiting('w1', iso('10:00'))], at('10:10')).alerts).toHaveLength(1);
  });

  it(`at ${NOT_MARKED_GRACE_MIN} minutes over it hands over to "Not marked done yet" — never counted in both`, () => {
    const late = [appt(iso('10:00'), iso('10:30'))];
    const [g] = groupBookings(late);
    // 29 min 59 s over: an alert here, not yet counted there.
    expect(card(late, [], at('10:59', 59)).alerts).toEqual([expect.objectContaining({ kind: 'over_time', minutes: 29 })]);
    expect(countsAsNotMarked(g!, at('10:59', 59))).toBe(false);
    // 30 min over: counted there, and no longer an alert here.
    expect(countsAsNotMarked(g!, at('11:00'))).toBe(true);
    expect(card(late, [], at('11:00')).alerts).toEqual([]);
  });

  it('the two rules can never disagree, minute by minute from the booked end to two hours after', () => {
    const [g] = groupBookings([appt(iso('10:00'), iso('10:30'))]);
    for (let m = 0; m <= 120; m += 1) {
      const now = new Date(new Date(iso('10:30')).getTime() + m * 60_000);
      expect(isOverTime(g!, now) && countsAsNotMarked(g!, now), `${m} min over`).toBe(false);
      expect(isOverTime(g!, now), `${m} min over`).toBe(m >= ALERT_AFTER_MIN && m < NOT_MARKED_GRACE_MIN);
    }
  });

  it('it stays in the chair row until the room lets it go, an hour past its end, like the Bookings list says', () => {
    const late = [appt(iso('10:00'), iso('10:30'))];
    expect(card(late, [], at('11:29')).inChair).toHaveLength(1);
    expect(card(late, [], at('11:30')).inChair).toEqual([]);
  });

  it('a sitting with one leg paid is dealt with, not over time', () => {
    const legs = [
      appt(iso('10:00'), iso('10:30'), 'completed', { bookingGroupId: 'g1' }),
      appt(iso('10:30'), iso('11:00'), 'confirmed', { bookingGroupId: 'g1' }),
    ];
    expect(card(legs, [], at('11:20')).alerts).toEqual([]);
  });
});

describe('AC-04 — a queue that could not be read', () => {
  it('leaves the Walk-ins row out rather than showing 0', () => {
    expect(card([], null, at('10:00')).walkIns).toBeNull();
  });

  it('is never "all clear": not calm, and it says the queue was not read (BR-12)', () => {
    const s = card([], null, at('10:00'));
    expect(s.calm).toBe(false);
    expect(s.queueUnread).toBe(true);
    // The visits that WERE read still alert.
    expect(card([appt(iso('09:00'), iso('09:30'))], null, at('09:45')).alerts).toHaveLength(1);
  });

  it('an empty queue that WAS read is 0', () => {
    expect(card([], [], at('10:00')).walkIns).toEqual({ count: 0, longestMin: 0 });
  });

  it('counts who is waiting and the longest wait', () => {
    expect(card([], [waiting('w1', iso('10:00')), waiting('w2', iso('10:05'))], at('10:08')).walkIns).toEqual({ count: 2, longestMin: 8 });
  });
});

describe('AC-05 — calm', () => {
  it('nothing over time and nobody waiting long is no alert at all', () => {
    const s = card([appt(iso('10:00'), iso('10:45'))], [waiting('w1', iso('10:15'))], at('10:20'));
    expect(s.alerts).toEqual([]);
    expect(s.moreAlerts).toBe(0);
    expect(s.calm).toBe(true);
    expect(s.queueUnread).toBe(false);
  });
});

describe('after closing — the card follows the list to tomorrow', () => {
  it("shows tomorrow's first visit, and no In the chair row once nobody is in", () => {
    const tomorrow = [appt('2026-09-27T05:30:00.000Z', '2026-09-27T06:00:00.000Z'), appt('2026-09-27T04:30:00.000Z', '2026-09-27T05:00:00.000Z')];
    const s = card([appt(iso('19:00'), iso('19:30'), 'completed')], [], at('21:00'), true, tomorrow);
    expect(s.inChair).toBeNull();
    expect(s.nextIsTomorrow).toBe(true);
    expect(s.next?.startAt).toBe('2026-09-27T04:30:00.000Z');
  });

  it('skips a cancelled first visit', () => {
    const tomorrow = [appt('2026-09-27T04:30:00.000Z', '2026-09-27T05:00:00.000Z', 'cancelled'), appt('2026-09-27T05:30:00.000Z', '2026-09-27T06:00:00.000Z')];
    expect(card([], [], at('21:00'), true, tomorrow).next?.startAt).toBe('2026-09-27T05:30:00.000Z');
  });

  it('nothing booked tomorrow is no first visit', () => {
    expect(card([], [], at('21:00'), true).next).toBeNull();
  });

  it('a walk-in still waiting after closing is still an alert', () => {
    const s = card([], [waiting('w1', iso('20:40'))], at('21:00'), true);
    expect(s.alerts).toEqual([expect.objectContaining({ kind: 'waiting', minutes: 20 })]);
  });

  it('a visit running over at closing stays an alert until it hands over — it does not vanish at closing time', () => {
    // Booked 20:00–20:40; the business closed at 21:00.
    const over = [appt(iso('20:00'), iso('20:40'))];
    const s = card(over, [], at('21:05'), true);
    expect(s.alerts).toEqual([expect.objectContaining({ kind: 'over_time', minutes: 25 })]);
    // Still in the chair, so the row stays even after closing.
    expect(s.inChair).toHaveLength(1);
    // At 30 minutes over it is "Not marked done yet"'s, as in the day.
    expect(card(over, [], at('21:10'), true).alerts).toEqual([]);
  });
});

describe('atBranch — only the branch Home shows', () => {
  const items = [{ id: 1, locationId: 'b1' }, { id: 2, locationId: 'b2' }, { id: 3 }];

  it('every branch when none is picked', () => {
    expect(atBranch(items, null).map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it("the picked branch's, and anything the API sent with no branch", () => {
    expect(atBranch(items, 'b2').map((x) => x.id)).toEqual([2, 3]);
  });
});
