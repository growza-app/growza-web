import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDailyTokens, tokenNumbersOf } from './pos-helpers';
import type { Appointment } from '../lib/api-types';

/**
 * QA 2026-11-06 — an order has ONE token number, on the receipt, on the POS Queue and on Home.
 *
 * Home numbered only the orders it was about to show, so a fully returned order (which Home hides) shifted every
 * later token down by one: Anjali's order was Token 6 on her receipt and #05 on Home — and #04 a moment before.
 * The day below is the one that found it: seven orders, the first and the fifth fully returned.
 */
const DAY = '2026-11-06';
const at = (hhmm: string) => `${DAY}T${hhmm}:00.000Z`;
const isToday = (ms: number) => new Date(ms).toISOString().slice(0, 10) === DAY;

interface Order {
  id: string;
  soldAt: string;
  status?: string;
  /** What is left on the bill after returns. */
  items: number;
}
const orders: Order[] = [
  { id: 'a-rohit', soldAt: at('09:11'), items: 0 }, // fully returned
  { id: 'b-anjali-1', soldAt: at('09:15'), items: 3 },
  { id: 'c-anjali-2', soldAt: at('09:16'), items: 3 },
  { id: 'd-anjali-3', soldAt: at('09:18'), items: 10 },
  { id: 'e-anjali-4', soldAt: at('09:19'), items: 0 }, // fully returned
  { id: 'f-swiggy', soldAt: at('09:21'), items: 3 },
  { id: 'g-paise', soldAt: at('09:23'), items: 3 },
];

/** The POS draws the same day from appointment rows: a fully returned bill still has its products, returned. */
const posRows = orders.map(
  (o) =>
    ({
      id: o.id,
      startAt: o.soldAt,
      status: 'completed',
      locationId: 'loc-1',
      customerName: o.id,
      channel: 'counter',
      paymentMode: 'cash',
      products: [{ name: 'Dish', qty: Math.max(o.items, 1), returnedQty: o.items === 0 ? 1 : 0, paidMinor: '10000', returnedMinor: o.items === 0 ? '10000' : '0' }],
    }) as unknown as Appointment,
);

describe('Home numbers its tokens the way the POS does', () => {
  it('gives every order of the day the number the POS gives it', () => {
    const pos = new Map(buildDailyTokens(posRows, 'loc-1', {}, Date.parse(at('10:00'))).map((t) => [t.id, t.tokenNo]));
    const home = tokenNumbersOf(orders, isToday);
    expect([...home]).toEqual([...pos]);
    expect(home.get('b-anjali-1')).toBe(2); // not 1, though Home hides the returned order before it
    expect(home.get('g-paise')).toBe(7);
  });

  it('does not move a number when an order before it is returned', () => {
    const before = tokenNumbersOf(orders.map((o) => (o.id === 'c-anjali-2' ? { ...o, items: 3 } : o)), isToday);
    const after = tokenNumbersOf(orders.map((o) => (o.id === 'c-anjali-2' ? { ...o, items: 0 } : o)), isToday);
    expect(after.get('d-anjali-3')).toBe(before.get('d-anjali-3'));
  });

  it('does not count a cancelled order, as the POS does not', () => {
    const withCancelled = [...orders, { id: 'h-cancelled', soldAt: at('09:10'), status: 'cancelled', items: 2 }];
    expect(tokenNumbersOf(withCancelled, isToday).get('a-rohit')).toBe(1);
    expect(tokenNumbersOf(withCancelled, isToday).has('h-cancelled')).toBe(false);
  });

  it('counts a returned marketplace order, which the POS lists as an order', () => {
    const marketplace = orders.map((o) => (o.id === 'f-swiggy' ? { ...o, status: 'returned' } : o));
    expect(tokenNumbersOf(marketplace, isToday).get('g-paise')).toBe(7);
  });

  it('breaks a tie between two orders in the same minute by id, as the POS does', () => {
    const tie = [
      { id: 'z', soldAt: at('09:30'), items: 1 },
      { id: 'a', soldAt: at('09:30'), items: 1 },
    ];
    expect([...tokenNumbersOf(tie, isToday)]).toEqual([['a', 1], ['z', 2]]);
  });

  it('leaves yesterday’s orders out of today’s numbering', () => {
    const yesterday = [{ id: 'old', soldAt: '2026-11-05T09:00:00.000Z', items: 1 }, ...orders];
    expect(tokenNumbersOf(yesterday, isToday).has('old')).toBe(false);
    expect(tokenNumbersOf(yesterday, isToday).get('a-rohit')).toBe(1);
  });
});

describe('Home uses it', () => {
  const home = readFileSync(resolve(__dirname, '../components/home/ShopHome.tsx'), 'utf8');

  it('numbers over every order of the day, then narrows to what the card lists', () => {
    expect(home).toMatch(/const tokenNoOf = tokenNumbersOf\(sourceRows, /);
    expect(home).toMatch(/const tokenNo = tokenNoOf\.get\(o\.id\) \?\? idx \+ 1;/);
    // The position in the narrowed list is only a fallback for an order the day's list does not hold.
    expect(home.indexOf('tokenNoOf = tokenNumbersOf')).toBeLessThan(home.indexOf('const todaySorted = sourceRows'));
  });
});
