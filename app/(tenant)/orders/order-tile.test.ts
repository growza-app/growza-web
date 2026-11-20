import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { orderTile } from './order-tile';

describe("an order's tile (owner, 2026-11-21)", () => {
  it('draws how the order went out, whichever app it came from', () => {
    expect(orderTile({ channel: 'counter', orderType: 'dine_in' }, true)).toEqual({ kind: 'cutlery', hue: 1 });
    expect(orderTile({ channel: 'counter', orderType: 'takeaway' }, true)).toEqual({ kind: 'bag', hue: 4 });
    expect(orderTile({ channel: 'counter', orderType: 'delivery' }, true)).toEqual({ kind: 'scooter', hue: 2 });
    expect(orderTile({ channel: 'swiggy', orderType: null }, true)).toEqual({ kind: 'scooter', hue: 2 });
    expect(orderTile({ channel: 'zomato', orderType: 'takeaway' }, true)).toEqual({ kind: 'scooter', hue: 2 });
    expect(orderTile({ channel: 'amazon', orderType: null }, false)).toEqual({ kind: 'box', hue: 5 });
  });

  it('a shop, or a kitchen order from before types, is a counter bag — never guessed into dine-in', () => {
    expect(orderTile({ channel: 'counter', orderType: null }, true)).toEqual({ kind: 'bag', hue: 6 });
    expect(orderTile({ channel: 'counter', orderType: 'dine_in' }, false)).toEqual({ kind: 'bag', hue: 6 });
  });

  it('every hue it uses has its rule in the orders sheet', () => {
    const css = readFileSync(new URL('../styles/99-orders.css', import.meta.url), 'utf8');
    for (const n of [1, 2, 4, 5, 6]) expect(css).toContain(`.ord-tile[data-hue='${n}'] { --sec: var(--cat-${n}); }`);
  });
});
