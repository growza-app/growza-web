import { readFileSync } from 'node:fs';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { allCameBack } from '../lib/order-items';
import { homeCopy } from '../lib/home-copy';

/** QA 2026-11-14, F14 — "₹0 · No items" about an order that had two, both sent back. */
describe('an order everything on which came back says so', () => {
  it('is told apart from an order that had nothing, and from an older API', () => {
    expect(allCameBack({ items: 0, itemsSold: 2 })).toBe(true);
    expect(allCameBack({ items: 1, itemsSold: 2 })).toBe(false);
    expect(allCameBack({ items: 0, itemsSold: 0 })).toBe(false);
    expect(allCameBack({ items: 0 })).toBe(false);
  });

  it('says the count and that it all came back, in both languages, on the list and on Home', () => {
    expect(createTranslator({ locale: 'en', messages: en, namespace: 'orders.list' })('itemsAllBack', { count: 2 })).toBe('2 items · all came back');
    expect(createTranslator({ locale: 'hi', messages: hi, namespace: 'orders.list' })('itemsAllBack', { count: 2 })).toBe('2 सामान · सब वापस आया');
    expect(homeCopy('en').shop.itemsAllBackShort(1)).toBe('1 item · all came back');
    expect(homeCopy('hi').shop.itemsAllBackShort(3)).toBe('3 सामान · सब वापस आया');
    const list = readFileSync(new URL('./OrdersClient.tsx', import.meta.url), 'utf8');
    expect(list.match(/allCameBack\(r\) \? t\('list\.itemsAllBack', \{ count: r\.itemsSold \}\)/g)).toHaveLength(2);
    const home = readFileSync(new URL('../components/home/ShopHome.tsx', import.meta.url), 'utf8');
    expect(home.match(/allCameBack\(o\) \? s\.itemsAllBackShort\(o\.itemsSold\)/g)).toHaveLength(2);
  });
});
