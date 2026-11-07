import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDailyTokens, tokensStillOnTheBoard } from './pos-helpers';
import type { Appointment } from '../lib/api-types';

/**
 * QA 2026-11-06 — an order with nothing left on it is not an order to hand over.
 *
 * Rohit's ₹740 order and Anjali's ₹500 one were returned in full and refunded. Both stayed in the POS Queue as
 * "Deliver first — Hand over", at ₹0 with no dishes, and the tab badge counted them. Their TOKEN NUMBERS stay (the
 * day's numbering counts them, so every later slip still matches); only the cards go.
 */
const NOW = Date.parse('2026-11-06T09:30:00.000Z');
const at = (hhmm: string) => `2026-11-06T${hhmm}:00.000Z`;
const sale = (id: string, startAt: string, qty: number, returnedQty: number, extra: Record<string, unknown> = {}): Appointment =>
  ({
    id,
    startAt,
    status: 'completed',
    locationId: 'loc-1',
    customerName: id,
    channel: 'counter',
    paymentMode: 'cash',
    products: [{ name: 'Dish', qty, returnedQty, paidMinor: String(qty * 10000), returnedMinor: String(returnedQty * 10000) }],
    ...extra,
  }) as unknown as Appointment;

const day = [
  sale('rohit', at('09:11'), 5, 5), // returned in full
  sale('anjali-1', at('09:15'), 3, 0),
  sale('anjali-2', at('09:16'), 3, 1), // part returned
  sale('anjali-3', at('09:18'), 2, 2), // returned in full
  sale('swiggy', at('09:21'), 2, 0),
];

describe('the Queue board', () => {
  const tokens = buildDailyTokens(day, 'loc-1', {}, NOW);

  it('leaves out an order returned in full, and keeps one part returned', () => {
    expect(tokensStillOnTheBoard(tokens).map((t) => t.id)).toEqual(['anjali-1', 'anjali-2', 'swiggy']);
  });

  it('does not move anybody’s token number — a returned order still holds its place in the day', () => {
    expect(tokens.map((t) => [t.id, t.tokenNo])).toEqual([['rohit', 1], ['anjali-1', 2], ['anjali-2', 3], ['anjali-3', 4], ['swiggy', 5]]);
    expect(tokensStillOnTheBoard(tokens).map((t) => t.tokenNo)).toEqual([2, 3, 5]);
  });

  it('keeps an order that was handed over and is still whole, in Completed', () => {
    const handed = buildDailyTokens(day, 'loc-1', { 'anjali-1': 'completed' }, NOW);
    expect(tokensStillOnTheBoard(handed).filter((t) => t.state === 'completed').map((t) => t.id)).toEqual(['anjali-1']);
  });

  it('keeps a part-returned order’s total at what is left', () => {
    const [partly] = tokensStillOnTheBoard(tokens).filter((t) => t.id === 'anjali-2');
    expect(partly!.totalMinor).toBe(20000);
  });

  it('an order nobody has paid for yet is still on the board', () => {
    const unpaid = buildDailyTokens([sale('pending', at('09:25'), 1, 0, { paymentMode: null, paymentPending: true })], 'loc-1', {}, NOW);
    expect(tokensStillOnTheBoard(unpaid)).toHaveLength(1);
  });

  it('works on nothing at all', () => {
    expect(tokensStillOnTheBoard([])).toEqual([]);
  });
});

describe('the POS uses it for the lists and the badge, and not for the numbering', () => {
  const client = readFileSync(resolve(__dirname, 'PosClient.tsx'), 'utf8');

  it('filters both lists, which is where the tab badge and the column counts read from', () => {
    expect(client).toMatch(/tokensStillOnTheBoard\(dailyTokens\)\.filter\(\(tk\) => tk\.state === 'preparing'\)/);
    expect(client).toMatch(/tokensStillOnTheBoard\(dailyTokens\)\.filter\(\(tk\) => tk\.state === 'completed'\)/);
  });

  it('numbers the next token over every order, returned ones included', () => {
    expect(client).toMatch(/const nextTokenNo = dailyTokens\.length \+ 1;/);
  });
});
