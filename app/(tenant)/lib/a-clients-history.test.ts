import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { areaAllows, areasOf, clientHistoryOf, DIARY_AREAS } from './areas';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Owner, 2026-10-28 — "See bookings" on a restaurant's client card went Home.
 *
 * The card is one component for a salon, a shop and a restaurant, and it linked every one of them to
 * `/appointments?customerId=`. A restaurant has no diary, so `areaAllows` bounced it to Home: a button that looked
 * like it worked and could not. These cases pin both halves of the answer — the right screen, and the right word for
 * it — because the word is the part that silently drifts back.
 */
const shop = areasOf({ capabilities: { bookings: false, services: false }, surface: 'shop' });
const restaurant = areasOf({ capabilities: { bookings: false, services: false, stockCounted: false, marketplaces: false }, surface: 'shop' });

describe('where a client’s past lives', () => {
  it('is the diary for a salon', () => {
    expect(clientHistoryOf(DIARY_AREAS)).toEqual({ kind: 'bookings', href: '/appointments?customerId=' });
  });

  it('is Orders for a shop and for a restaurant — the screens they actually have', () => {
    for (const areas of [shop, restaurant]) expect(clientHistoryOf(areas)).toEqual({ kind: 'orders', href: '/orders?customerId=' });
  });

  it('never points at a screen the business would be bounced off', () => {
    for (const areas of [DIARY_AREAS, shop, restaurant, areasOf(null)]) {
      const place = clientHistoryOf(areas);
      if (place) expect(areaAllows(place.href.split('?')[0]!, areas), place.href).toBe(true);
    }
  });

  it('offers nothing rather than a link to nowhere', () => {
    expect(clientHistoryOf({ bookings: false, services: false, shop: false, stock: false })).toBe(null);
  });

  it('a session that cannot say still gets the diary it always had', () => {
    expect(clientHistoryOf(areasOf(null))?.kind).toBe('bookings');
    expect(clientHistoryOf()?.kind).toBe('bookings');
  });
});

describe('the button names the screen it opens', () => {
  it('has both words, in both languages', () => {
    for (const m of [en, hi]) {
      expect(m.clientCard.viewBookings.trim()).not.toBe('');
      expect(m.clientCard.viewOrders.trim()).not.toBe('');
      expect(m.clientCard.viewOrders).not.toBe(m.clientCard.viewBookings);
    }
  });

  it('English says Orders, the word that business’s own nav uses', () => {
    expect(en.clientCard.viewOrders).toBe('See orders');
    expect(en.pos.orders).toBe('Orders');
  });

  it('the card picks the word from the areas, and does not hardcode the diary’s address', () => {
    const card = readFileSync(join(process.cwd(), 'app/(tenant)/components/ClientProfileCard.tsx'), 'utf8');
    expect(card).toContain('clientHistoryOf(areas)');
    expect(card).toContain("c.viewOrders : c.viewBookings");
    // The whole bug in one assertion: no literal diary link anywhere in this file.
    expect(card).not.toContain('/appointments?customerId=');
  });
});
