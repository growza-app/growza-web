import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { dishTotals } from './KitchenClient';
import type { KitchenCard } from '../lib/api';

/** Owner, 2026-11-17 — "Dishes to cook": the open orders' dishes added up, for cooking a rush in batches. */
const card = (placedAt: string, dishes: Array<[string, number, { done?: boolean; cancelled?: boolean }?]>, late = false): KitchenCard => ({
  saleId: placedAt,
  tokenNo: 1,
  tableName: null,
  orderType: 'takeaway',
  channel: 'counter',
  placedAt,
  late,
  dishes: dishes.map(([name, qty, f], i) => ({ id: `${placedAt}-${i}`, name, qty, done: f?.done ?? false, isNew: false, cancelled: f?.cancelled ?? false })),
});

describe('dishTotals', () => {
  const cards = [
    card('2026-11-17T10:00:00Z', [['Butter Naan', 4], ['Dal Makhani', 1]], true),
    card('2026-11-17T10:05:00Z', [['Butter Naan', 2], ['Butter Naan', 1], ['Paneer Tikka', 1, { done: true }]]),
    card('2026-11-17T10:10:00Z', [['Dal Makhani', 2], ['Gulab Jamun', 2, { cancelled: true }]]),
  ];

  it('adds up each dish across orders: quantity, how many orders, the oldest, and whether any is late', () => {
    expect(dishTotals(cards)).toEqual([
      { name: 'Butter Naan', qty: 7, orders: 2, oldestAt: '2026-11-17T10:00:00Z', late: true },
      { name: 'Dal Makhani', qty: 3, orders: 2, oldestAt: '2026-11-17T10:00:00Z', late: true },
    ]);
  });

  it('a ticked dish, or one taken off the bill, is not still to cook', () => {
    const names = dishTotals(cards).map((d) => d.name);
    expect(names).not.toContain('Paneer Tikka');
    expect(names).not.toContain('Gulab Jamun');
  });

  it('a tie in quantity goes to the dish waiting longest', () => {
    const tie = [card('2026-11-17T11:00:00Z', [['Jeera Rice', 2]]), card('2026-11-17T09:00:00Z', [['Masala Chaas', 2]])];
    expect(dishTotals(tie).map((d) => d.name)).toEqual(['Masala Chaas', 'Jeera Rice']);
  });

  it('nothing open, nothing to cook', () => {
    expect(dishTotals([])).toEqual([]);
  });
});

describe('the screen', () => {
  const src = readFileSync(resolve(__dirname, 'KitchenClient.tsx'), 'utf8');
  it('a dish total opens the orders that still need it, with Show all to go back', () => {
    expect(src).toMatch(/setDish\(d\.name\);\s*setView\('orders'\);/);
    expect(src).toContain(".filter((c) => !dish || c.dishes.some((d) => d.name === dish && !d.done && !d.cancelled))");
  });
  it('the totals follow the Dine-in / Takeaway / Delivery filter', () => {
    expect(src).toContain("dishTotals(cards.filter((c) => only === 'all' || c.orderType === only))");
  });
  it('its words in English and Hindi', () => {
    for (const k of ['viewOrders', 'viewDishes', 'totalsEmpty', 'inOrders', 'oldest', 'onlyDish', 'showAll'] as const) {
      expect(en.kitchen[k]).toBeTruthy();
      expect(hi.kitchen[k]).toBeTruthy();
    }
  });
});
