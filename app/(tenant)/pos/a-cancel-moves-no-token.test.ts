import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDailyTokens, numberTheDay, tokenNumbersOf } from './pos-helpers';
import type { Appointment } from '../lib/api-types';

/**
 * Owner, 9 Nov 2026 — "cancel #04 and #05 becomes #04". The API stores each order's token when it is rung up (0174);
 * every screen shows THAT number, so a cancel or a return of one order never moves another's.
 */
const DAY = '2026-11-09';
const at = (hhmm: string) => `${DAY}T${hhmm}:00.000Z`;
const NOW = Date.parse(at('12:00'));
const order = (id: string, hhmm: string, tokenNo: number | null, extra: Record<string, unknown> = {}): Appointment =>
  ({
    id,
    startAt: at(hhmm),
    status: 'completed',
    locationId: 'loc-1',
    customerName: id,
    channel: 'counter',
    paymentMode: null,
    paymentPending: true,
    tokenNo,
    products: [{ name: 'Dosa', qty: 1, returnedQty: 0, paidMinor: '12000', returnedMinor: '0' }],
    ...extra,
  }) as unknown as Appointment;

describe('the Queue shows the number the order was given', () => {
  it('after #04 is cancelled (and so is not in the list), #05 is still #05', () => {
    const day = [order('o1', '09:00', 1), order('o2', '09:05', 2), order('o3', '09:10', 3), order('o5', '09:20', 5), order('o6', '09:25', 6)];
    const tokens = buildDailyTokens(day, 'loc-1', {}, NOW);
    expect(tokens.map((t) => [t.id, t.tokenLabel])).toEqual([
      ['o1', '#01'],
      ['o2', '#02'],
      ['o3', '#03'],
      ['o5', '#05'],
      ['o6', '#06'],
    ]);
  });

  it('the next order is labelled one past the highest, not the count plus one (which would be #05 again)', () => {
    const client = readFileSync(resolve(__dirname, 'PosClient.tsx'), 'utf8');
    expect(client).toContain('const nextTokenNo = dailyTokens.reduce((n, tk) => Math.max(n, tk.tokenNo), 0) + 1;');
  });

  it('a walk-in carries its token on one leg of its visit, and the visit shows it', () => {
    const legs = [
      { ...order('v-leg-1', '10:00', 7), bookingGroupId: 'g1', serviceName: 'Haircut', products: [] },
      { ...order('v-leg-2', '10:30', null), bookingGroupId: 'g1', serviceName: 'Beard', products: [] },
    ] as unknown as Appointment[];
    const [visit] = buildDailyTokens(legs, 'loc-1', {}, NOW);
    expect(visit!.tokenNo).toBe(7);
  });

  it('Home numbers the day the same way, from the same stored numbers', () => {
    const rows = [
      { id: 'o1', soldAt: at('09:00'), tokenNo: 1 },
      { id: 'o4', soldAt: at('09:15'), tokenNo: 4, status: 'cancelled' },
      { id: 'o5', soldAt: at('09:20'), tokenNo: 5 },
    ];
    const home = tokenNumbersOf(rows, (ms) => new Date(ms).toISOString().startsWith(DAY));
    expect([...home]).toEqual([
      ['o1', 1],
      ['o5', 5],
    ]);
  });
});

describe('an order the API gave no number (an older API, or a visit with no token)', () => {
  it('is numbered in the order of the day as before, when nothing is stored', () => {
    const day = [order('a', '09:00', null), order('b', '09:05', null), order('c', '09:10', null)];
    expect(buildDailyTokens(day, 'loc-1', {}, NOW).map((t) => t.tokenNo)).toEqual([1, 2, 3]);
  });

  it('takes a number after the stored ones, never one another order already has', () => {
    const numbers = numberTheDay(
      [{ k: 'x', n: null }, { k: 'y', n: 1 }, { k: 'z', n: 2 }, { k: 'w', n: null }],
      (o) => o.n,
      (o) => o.k,
    );
    expect(Object.fromEntries(numbers)).toEqual({ y: 1, z: 2, x: 3, w: 4 });
  });
});
