import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { areaAllows, areasOf } from './areas';
import { channelsOf, isDeliveryApp, sellsOnMarketplaces } from './order-channels';

/**
 * Owner, 2026-10-24 — a restaurant's online orders come from Swiggy and Zomato; a shop's from Flipkart and Amazon.
 *
 * Each business is shown its own kind of channel and nothing of the other: the screens ask `/me` (through `Areas`),
 * never what kind of business this is.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const kitchen = areasOf({ capabilities: { bookings: false, services: false, stockCounted: false, marketplaces: false }, surface: 'shop', deliveryApps: ['swiggy', 'zomato'] });
const shop = areasOf({ capabilities: { bookings: false, services: false }, surface: 'shop' });
const salon = areasOf({});

describe('which channels a business has', () => {
  it('a restaurant: the counter and its delivery apps; a shop: the counter and the marketplaces', () => {
    expect(channelsOf(kitchen)).toEqual(['counter', 'swiggy', 'zomato']);
    expect(channelsOf(shop)).toEqual(['counter', 'flipkart', 'amazon']);
    expect(sellsOnMarketplaces(kitchen)).toBe(false);
    expect(sellsOnMarketplaces(shop)).toBe(true);
    // A `/me` that says nothing about it (an API a deploy behind) keeps the shop exactly as it was.
    expect(sellsOnMarketplaces(salon)).toBe(true);
    expect(isDeliveryApp('swiggy') && isDeliveryApp('zomato')).toBe(true);
    expect(isDeliveryApp('flipkart') || isDeliveryApp('counter')).toBe(false);
  });

  it('a shop’s areas read exactly as before: the two new keys appear only where they say something', () => {
    expect('marketplaces' in shop).toBe(false);
    expect('deliveryApps' in shop).toBe(false);
  });
});

describe('the marketplace screens are absent where nothing is sold on a marketplace', () => {
  it('import, held orders and Online selling are closed to a restaurant and open to a shop; sales by channel is everyone’s', () => {
    for (const href of ['/orders/import', '/orders/held', '/settings/channels']) {
      expect(areaAllows(href, kitchen), href).toBe(false);
      expect(areaAllows(href, shop), href).toBe(true);
    }
    expect(areaAllows('/stock/channels', kitchen)).toBe(true);
    expect(areaAllows('/orders', kitchen)).toBe(true);
  });

  it('Settings lists only the screens the business may open', () => {
    expect(src('settings/SettingsNavList.tsx')).toContain('(!row.href || areaAllows(row.href, areas))');
  });
});

describe('each screen draws the business’s own channels', () => {
  it('Home lists the channels it has, and says nothing about sending where nothing ships', () => {
    const home = src('components/home/ShopHome.tsx');
    expect(home).toContain('return channelsOf(areas).map((key) => {');
    expect(home).toContain('const ships = sellsOnMarketplaces(areas);');
    expect(home).toContain('{!ships ? s.ordersInPeriod : data.toSend > 0');
    // The list of what waits to be sent is not even asked for.
    expect(home).toMatch(/if \(ships\) \{\s*\n\s*api\s*\n\s*\.orders\(\{ status: 'new,packed'/);
  });

  it('Orders offers the business’s own channel chips, no parcel states where nothing ships, and the app’s order number', () => {
    const list = src('orders/OrdersClient.tsx');
    expect(list).toContain('{offered.map((c) => (');
    expect(list).toContain('{ships ? (');
    expect(list).toContain("isDeliveryApp(r.channel) && r.externalRef ? <span className=\"ord-code\">{t('list.appOrder', { ref: r.externalRef })}</span>");
  });

  it('an app order’s page names the app, its number and its guest, and offers nothing a marketplace would need', () => {
    const page = src('orders/[id]/OrderClient.tsx');
    expect(page).toContain('const fromApp = isDeliveryApp(order.channel);');
    expect(page).toContain("t('detail.placedApp', { channel: channelWord(order.channel) })");
    expect(page).toContain('{!isCounter && !fromApp ? (');
  });

  it('Returns and the reports hub leave out what only a parcel or a count has', () => {
    expect(src('orders/returns/ReturnsClient.tsx')).toContain('const ships = sellsOnMarketplaces(useAreas());');
    const hub = src('components/RetailReportsNav.tsx');
    expect(hub).toContain("areas.stock ? `${tSellers('viewBest')} · ${tSellers('viewDead')}` : tSellers('viewBest')");
    expect(hub).toContain("sellsOnMarketplaces(areas) ? `${tReturns('customerTitle')} · ${tReturns('undeliveredTitle')}` : tReturns('customerTitle')");
    expect(src('reports/page.tsx')).toContain('mayOpenShopReports && counted ?');
  });
});

describe('Swiggy and Zomato have their names, in English and Hindi', () => {
  it('on Orders, the order page, Refunds and Sales by channel', () => {
    for (const m of [en, hi]) {
      for (const ch of ['swiggy', 'zomato'] as const) {
        expect(m.orders.channels[ch]).toBeTruthy();
        expect(m.orders.refunds[ch]).toBeTruthy();
        expect(m.products.channels[ch]).toBeTruthy();
      }
      expect(m.orders.detail.placedApp).toContain('{channel}');
      expect(m.orders.detail.appOrderRef).toContain('{ref}');
      expect(m.orders.list.appOrder).toContain('{ref}');
      expect(m.orders.buyer.fromApp).toContain('{channel}');
    }
    expect(hi.orders.channels.swiggy).toBe('स्विगी');
    expect(hi.orders.channels.zomato).toBe('ज़ोमैटो');
  });
});
