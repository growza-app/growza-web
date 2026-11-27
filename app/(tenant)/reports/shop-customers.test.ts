import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { BillOffer, RestaurantCustomersPage } from '../lib/api-types';
import { areaAllows, DIARY_AREAS, type Areas } from '../lib/areas';
import { canSee } from '../lib/nav-policy';
import { CustomersTab } from './RestaurantReports';
import { MissYouSheet } from './MissYouSheet';
import { PointsSheet } from './PointsSheet';
import { DISH, MISS_YOU_KINDS, PRODUCT, dishForMessage, missYouFor, missYouTemplate, placeholderOf } from './miss-you';
import { dishFansTemplate, fanDish } from './dish-fans';
import { pointsFor, pointsTemplate } from './points-reminder';
import { RESTAURANT_TABS } from './restaurant-tabs';

/**
 * Owner, 2026-11-28 — "I want reports like we have for restaurants, especially for guests — here it will be client." A
 * retail shop's Reports › Customers: the restaurant's Guests tab, drawn by the same components in the shop's words
 * (customers, products), with the shop's own WhatsApp lines. The restaurant's tab is untouched.
 */
const SHOP: Areas = { bookings: false, services: false, shop: true, stock: true };
const KITCHEN: Areas = { ...SHOP, stock: false, tables: true, recipes: true };
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const render = (locale: 'en' | 'hi', el: ReactElement) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'Asia/Kolkata', children: el }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
const waText = (html: string) => [...html.matchAll(/href="https:\/\/wa\.me\/\d+\?text=([^"]*)"/g)].map((m) => decodeURIComponent(m[1]!.replace(/&#x27;/g, "'")));

type Tree = { [k: string]: string | Tree };
const leaves = (o: Tree, at = ''): Array<[string, string]> =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[at ? `${at}.${k}` : k, v] as [string, string]] : leaves(v, at ? `${at}.${k}` : k)));
/** The ICU argument names a sentence takes (`{n, plural, …}` → n), sorted. */
const args = (s: string) => [...s.matchAll(/\{(\w+)(?=[,}])/g)].map((m) => m[1]).sort();
const shopEn = (en as unknown as { shopCustomers: Tree }).shopCustomers;
const shopHi = (hi as unknown as { shopCustomers: Tree }).shopCustomers;
const restEn = (en as unknown as { restaurantReports: { customers: Tree } }).restaurantReports.customers;
const restHi = (hi as unknown as { restaurantReports: { customers: Tree } }).restaurantReports.customers;
/** A sentence's words, without its placeholders: `{dish}` is an argument's name, never shown. */
const wordsOf = (s: string) => s.replace(/\{\w+\}/g, '').replace(/\{(\w+),/g, '{,');
const EMOJI = /\p{Extended_Pictographic}/u;
const FOOD = /guest|dish|order(ed)?\b|craving|meal|food|menu|kitchen|🍽/i;

const offer = (o: Partial<BillOffer>): BillOffer => ({
  id: 'o1', kind: 'coupon', name: 'Come back', code: null, offBp: null, offMinor: null, minBillMinor: 0, usesPerGuest: null,
  productId: null, productName: null, buyQty: null, getQty: null, validFrom: null, validUntil: null, used: 0, ...o,
});

const window = { key: 'custom' as const, from: '2026-11-18', to: '2026-11-24', days: 7, previous: { from: '2026-11-11', to: '2026-11-17' } };
const overdueRows = Array.from({ length: 7 }, (_, i) => ({
  customerId: `c${i}`,
  name: i === 0 ? 'Rohan Gupta' : `Person ${i}`,
  phone: `+91 98100 0000${i}`,
  visits: 8 - i,
  usualGapDays: 10,
  lastSeenDaysAgo: 22 + i,
  favouriteDish: i === 0 ? 'Running Shoe (UK 9)' : null,
}));
const waiting = {
  count: 2,
  minRedeemPoints: 500,
  rows: [
    { customerId: 'p1', name: 'Neha Iyer', phone: '+91 98200 00001', points: 800, worthMinor: 80_000, expiring: null },
    { customerId: 'p2', name: 'Kabir Singh', phone: '+91 98200 00002', points: 1200, worthMinor: 120_000, expiring: null },
  ],
};
const fans = {
  count: 3,
  awayDays: 15,
  minOrders: 3,
  dishes: [
    {
      key: 'shoe',
      dish: 'Running Shoe (UK 9)',
      fans: 2,
      rows: [
        { customerId: 'f1', name: 'Arjun Mehra', phone: '+91 98300 00001', orders: 4, lastSeenDaysAgo: 20 },
        { customerId: 'f2', name: 'Isha Khanna', phone: '+91 98300 00002', orders: 3, lastSeenDaysAgo: 16 },
      ],
    },
    { key: 'ball', dish: 'Cricket Ball', fans: 1, rows: [{ customerId: 'f3', name: 'Bina Arora', phone: '+91 98300 00003', orders: 3, lastSeenDaysAgo: 18 }] },
  ],
};
const shop: RestaurantCustomersPage = {
  window,
  cameBack: { value: 59, previous: 40, changePct: 47.5 },
  newGuests: { value: 2, previous: 5, changePct: -60 },
  capturePct: 71,
  bills: 210,
  lowCapture: false,
  guestCount: 140,
  top: [
    { customerId: 't1', name: 'Rohan Gupta', visits: 6, salesMinor: 1_240_000 },
    { customerId: 't2', name: 'Neha Iyer', visits: 4, salesMinor: 860_000 },
  ],
  topShare: { guests: 28, pct: 58 },
  returnByMonth: [
    { month: '2026-09', newGuests: 30, cameBack: 9, pct: 30, partial: false },
    { month: '2026-10', newGuests: 22, cameBack: 8, pct: 36, partial: false },
    { month: '2026-11', newGuests: 6, cameBack: 1, pct: null, partial: true },
  ],
  overdue: { count: 11, rows: overdueRows },
  pointsWaiting: waiting,
  dishFans: fans,
};

describe('the shop’s words', () => {
  it('are the restaurant’s keys exactly, each taking the same placeholders — in English and in Hindi', () => {
    for (const [tree, restTree] of [[shopEn, restEn], [shopHi, restHi]] as const) {
      const rest = new Map(leaves(restTree));
      const mine = leaves(tree);
      expect(mine.map(([k]) => k).sort()).toEqual([...rest.keys()].sort());
      for (const [k, v] of mine) expect(args(v), k).toEqual(args(rest.get(k)!));
    }
  });

  it('say customer and product, never guest, dish or order', () => {
    for (const [k, v] of leaves(shopEn)) expect(wordsOf(v), k).not.toMatch(FOOD);
    for (const [k, v] of leaves(shopHi)) expect(v, k).not.toMatch(/मेहमान|डिश|मँगा|खाना/);
    expect(shopEn.cameBack).toBe('Customers who came back');
    expect((shopEn.fans as Tree).title).toBe('Fans of a product');
    expect(((shopEn.missYou as Tree).kind as Tree).craving).toBe('Their product');
    expect(shopHi.cameBack).toBe('दोबारा आए ग्राहक');
  });

  it('never write a literal 1 in a Hindi `one` branch (Hindi CLDR puts 0 there)', () => {
    for (const [k, v] of leaves(shopHi)) expect(v, k).not.toMatch(/one \{[^}]*\b1\b/);
  });

  it('name the tab Customers, in both languages, and reach the browser', () => {
    expect(en.reports.shopCustomersTab).toBe('Customers');
    expect(hi.reports.shopCustomersTab).toBe('ग्राहक');
    expect(src('../../../i18n/client-messages.ts')).toContain("'shopCustomers'");
  });
});

describe('the shop’s messages', () => {
  const at = 'Striker Sports House';
  const live = offer({ code: 'BACK10', offBp: 1000 });

  it('are the owner’s words, the shop named in each', () => {
    expect(missYouTemplate('miss', at, null, undefined, 'shop')).toBe('We miss you at Striker Sports House. Drop by this week.');
    expect(missYouTemplate('craving', at, null, undefined, 'shop')).toBe(`Need another ${PRODUCT}? Come back to Striker Sports House this week.`);
    expect(missYouTemplate('offer', at, live, '2026-11-28', 'shop')).toBe('We miss you at Striker Sports House. Come back this week and get 10% off with code BACK10.');
    expect(dishFansTemplate('Running Shoe (UK 9)', at, 'shop')).toBe('Come back to Striker Sports House for another Running Shoe this week.');
    expect(pointsTemplate(at, 'shop')).toBe('You have {points} points at Striker Sports House, worth {worth}. Use them on your next visit.');
  });

  it('promise nothing about stock: the product is not checked', () => {
    const lines = [
      ...MISS_YOU_KINDS.map((k) => missYouTemplate(k, at, live, '2026-11-28', 'shop')),
      missYouFor(missYouTemplate('craving', at, null, undefined, 'shop'), null, 'shop'),
      dishFansTemplate('Running Shoe (UK 9)', at, 'shop'),
    ];
    for (const line of lines) expect(line).not.toMatch(/stock|waiting|find it|in store|available/i);
  });

  it('points: the shop named, "our shop" with no name, no emoji — the restaurant’s line exactly as it was', () => {
    expect(pointsTemplate(null, 'shop')).toBe('You have {points} points at our shop, worth {worth}. Use them on your next visit.');
    expect(pointsTemplate('  ', 'shop')).toBe(pointsTemplate(null, 'shop'));
    const g = { points: 800, worthMinor: 80_000, expiring: null };
    expect(pointsFor(pointsTemplate(at, 'shop'), g)).toBe('You have 800 points at Striker Sports House, worth ₹800. Use them on your next visit.');
    expect(pointsFor(pointsTemplate(at, 'shop'), g)).not.toMatch(EMOJI);
    expect(pointsTemplate('Spice Garden')).toBe('You have {points} points at Spice Garden, worth {worth}. Use them on your next visit 🎁');
    expect(pointsTemplate('Spice Garden', 'restaurant')).toBe(pointsTemplate('Spice Garden'));
    expect(pointsTemplate(null)).toBe('You have {points} points at us, worth {worth}. Use them on your next visit 🎁');
  });

  it('no name, no "Hi", no emoji, nothing about food; English whatever the dashboard’s language', () => {
    const lines = [
      ...MISS_YOU_KINDS.map((k) => missYouFor(missYouTemplate(k, at, live, '2026-11-28', 'shop'), 'Running Shoe (UK 9)', 'shop')),
      dishFansTemplate('Running Shoe (UK 9)', at, 'shop'),
      pointsTemplate(at, 'shop'),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/^(hi|hello|dear)\b/i);
      expect(line).not.toMatch(EMOJI);
      expect(line).not.toMatch(/[ऀ-ॿ]/);
      expect(line).not.toMatch(FOOD);
      expect(line).toContain(at);
      expect(line).not.toContain('(UK 9)');
    }
  });

  it('their product: the customer’s most-bought product, size dropped — or "your usual" when there is none', () => {
    const t = missYouTemplate('craving', at, null, undefined, 'shop');
    expect(missYouFor(t, 'Running Shoe (UK 9)', 'shop')).toBe('Need another Running Shoe? Come back to Striker Sports House this week.');
    expect(missYouFor(t, null, 'shop')).toBe('Need more of your usual? Come back to Striker Sports House this week.');
    expect(missYouFor(missYouTemplate('craving', null, null, undefined, 'shop'), null, 'shop')).toBe('Need more of your usual? Come back to our shop this week.');
    expect(placeholderOf('shop')).toBe(PRODUCT);
  });

  it('a real product name with " + " in it stays whole; only the size in brackets goes (QA, 2026-11-28)', () => {
    expect(dishForMessage('Bat + Ball Set')).toBe('Bat + Ball Set');
    expect(dishForMessage('Shampoo + Conditioner')).toBe('Shampoo + Conditioner');
    expect(dishForMessage('Running Shoe (UK 9)')).toBe('Running Shoe');
    expect(fanDish('Bat + Ball Set')).toBe('Bat + Ball Set');
    const t = missYouTemplate('craving', at, null, undefined, 'shop');
    expect(missYouFor(t, 'Bat + Ball Set', 'shop')).toBe('Need another Bat + Ball Set? Come back to Striker Sports House this week.');
    expect(dishFansTemplate('Bat + Ball Set', at, 'shop')).toBe('Come back to Striker Sports House for another Bat + Ball Set this week.');
  });

  it('a comeback treat only when there is an offer to name; a shop with no name is "our shop"', () => {
    expect(missYouTemplate('offer', at, null, undefined, 'shop')).toBe(missYouTemplate('miss', at, null, undefined, 'shop'));
    expect(missYouTemplate('miss', null, null, undefined, 'shop')).toBe('We miss you at our shop. Drop by this week.');
  });

  it('leave the restaurant’s exactly as they were', () => {
    for (const k of MISS_YOU_KINDS) expect(missYouTemplate(k, 'Spice Garden', live, '2026-11-28', 'restaurant')).toBe(missYouTemplate(k, 'Spice Garden', live, '2026-11-28'));
    expect(missYouTemplate('craving', 'Spice Garden')).toBe(`Craving ${DISH}? We'd be happy to make it for you again at Spice Garden. Drop by or order whenever you're ready 🍽️`);
    expect(dishFansTemplate('Butter Chicken (Full)', 'Spice Garden')).toBe('Craving Butter Chicken? Your favourite is waiting at Spice Garden. Come in or order this week 🍽️');
    expect(placeholderOf()).toBe(DISH);
  });
});

describe('Reports › Customers, drawn for a shop', () => {
  const html = render('en', createElement(CustomersTab, { data: shop, words: 'shop' }));
  const out = text(html);

  it('came back, new, with a number, the top fifth — in customers', () => {
    expect(out).toContain('Customers who came back 59');
    expect(out).toContain('New customers 2');
    expect(out).toContain('Bills with a number 71%');
    expect(out).toContain('Top 20% of customers bring 58% of sales');
  });

  it('the month-by-month chart', () => {
    expect(out).toContain('New customers who came back within 30 days By the month of their first visit');
    expect(out).toContain('new customers come back within 30 days');
  });

  it('the overdue list, its message button, and each row’s line in the shop’s words', () => {
    expect(out).toContain('Regulars who are overdue · 11 Away twice as long as they usually are');
    expect(out).toContain('RG Rohan Gupta Usually every 10 days 22 days away');
    expect(waText(html)).toContain('We miss you at our shop. Drop by this week.');
  });

  it('points waiting, and fans of a product with the size dropped', () => {
    expect(out).toContain('Points waiting to be used · 2 Customers who can spend their points today');
    expect(out).toContain('Fans of a product · 3 Bought it on 3+ bills, not in for 15+ days. Pick a product. Running Shoe · 2 Cricket Ball · 1 Message Running Shoe fans');
    expect(out).toContain('AM Arjun Mehra Bought 4 times 20 days away');
    expect(waText(html)).toContain('Come back to our shop for another Running Shoe this week.');
  });

  it('top customers', () => {
    expect(out).toContain('Top customers Most visits in these dates 1 RG Rohan Gupta 6 visits');
    expect(out).toContain('A customer at two branches counts at each.');
  });

  it('says nothing of guests, dishes or food anywhere on it', () => {
    expect(out).not.toMatch(/guest|dish|ordered|craving|🍽/i);
    for (const line of waText(html)) expect(line).not.toMatch(/🍽|craving|dish/i);
  });

  it('someone who may not see customers: counts, no names', () => {
    const staff = text(
      render('en', createElement(CustomersTab, {
        words: 'shop',
        data: {
          ...shop,
          top: shop.top.map((g) => ({ ...g, customerId: null, name: null, salesMinor: null })),
          overdue: { count: 11, rows: [] },
          pointsWaiting: { ...waiting, rows: [] },
          dishFans: { ...fans, dishes: fans.dishes.map((d) => ({ ...d, rows: [] })) },
        },
      })),
    );
    expect(staff).toContain('11 regulars are overdue.');
    expect(staff).toContain('2 customers have points to spend.');
    expect(staff).toContain('Customer 6 visits');
    expect(staff).not.toMatch(/Rohan|Neha|Arjun|wa\.me/);
  });

  it('points waiting is absent when rewards are off', () => {
    expect(text(render('en', createElement(CustomersTab, { data: { ...shop, pointsWaiting: null }, words: 'shop' })))).not.toContain('Points waiting');
  });

  it('empty and low-number states, in the shop’s words', () => {
    const none = { overdue: undefined, pointsWaiting: null, dishFans: undefined };
    expect(text(render('en', createElement(CustomersTab, { data: { ...shop, ...none, bills: 0 }, words: 'shop' })))).toBe('No sales on these days yet.');
    expect(text(render('en', createElement(CustomersTab, { data: { ...shop, ...none, guestCount: 0 }, words: 'shop' })))).toBe('No customers with a number yet.');
    expect(text(render('en', createElement(CustomersTab, { data: { ...shop, lowCapture: true, capturePct: 18 }, words: 'shop' })))).toContain(
      "Add the customer's number on more bills to see who comes back.",
    );
  });

  it('the overdue, points and fans lists are counted from today, so an empty or low-number range still draws them', () => {
    for (const data of [
      { ...shop, bills: 0 },
      { ...shop, lowCapture: true, capturePct: 18 },
      { ...shop, guestCount: 0 },
    ]) {
      const html = render('en', createElement(CustomersTab, { data, words: 'shop' }));
      const out = text(html);
      expect(out).toContain('Regulars who are overdue · 11');
      expect(out).toContain('RG Rohan Gupta Usually every 10 days 22 days away');
      expect(out).toContain('Points waiting to be used · 2');
      expect(out).toContain('Fans of a product · 3');
      expect(html).toContain('rr-lists');
      // Top customers is the picked dates', and there is nothing in them to rank.
      expect(out).not.toContain('Top customers');
      expect(out).not.toContain('Customers who came back 59');
    }
    const empty = text(render('en', createElement(CustomersTab, { data: { ...shop, bills: 0 }, words: 'shop' })));
    expect(empty.startsWith('No sales on these days yet.')).toBe(true);
  });

  it('the restaurant’s Guests tab does the same: zero bills in range, overdue regulars still listed', () => {
    const html = render('en', createElement(CustomersTab, { data: { ...shop, bills: 0, pointsWaiting: null, dishFans: undefined } }));
    const out = text(html);
    expect(out).toContain('Regulars who are overdue · 11');
    expect(out).toContain('RG Rohan Gupta');
    expect(out).not.toContain('Top guests');
    expect(html.match(/class="rr-wa"/g)?.length).toBe(5);
  });

  it('in Hindi: ग्राहक and सामान, never मेहमान or डिश', () => {
    const hiOut = text(render('hi', createElement(CustomersTab, { data: shop, words: 'shop' })));
    expect(hiOut).toContain('दोबारा आए ग्राहक');
    expect(hiOut).toContain('किसी सामान के शौक़ीन');
    expect(hiOut).not.toMatch(/मेहमान|डिश/);
  });

  it('the restaurant’s tab is unchanged: no words is the restaurant’s words', () => {
    for (const locale of ['en', 'hi'] as const) {
      expect(render(locale, createElement(CustomersTab, { data: shop, words: 'restaurant' }))).toBe(render(locale, createElement(CustomersTab, { data: shop })));
    }
    const rest = text(render('en', createElement(CustomersTab, { data: shop })));
    expect(rest).toContain('Guests who came back');
    expect(rest).toContain('Fans of a dish');
    expect(rest).not.toMatch(/customer/i);
  });
});

describe('the shop’s message sheets', () => {
  it('we miss you: Miss you and Their product (no treat without an offer), the shop’s line, the {product} hint', () => {
    const html = render('en', createElement(MissYouSheet, { guests: overdueRows, business: 'Striker Sports House', location: null, todayISO: '2026-11-28', onClose: () => {}, words: 'shop' }));
    const out = text(html);
    expect(out).toContain('Message customers who are away');
    expect(out).toContain('Miss you Their product Message');
    expect(out).not.toContain('Comeback treat');
    expect(out).toContain("{product} becomes each customer's most-bought product.");
    expect(out).toContain('We miss you at Striker Sports House. Drop by this week.');
    expect(out).toContain('Rohan Gupta 22 days away · Running Shoe');
    expect(out).not.toMatch(/guest|dish/i);
  });

  it('points: the customers’ sheet over the same reminder', () => {
    const out = text(render('en', createElement(PointsSheet, { guests: waiting.rows, business: 'Striker Sports House', capPct: 100, onClose: () => {}, words: 'shop' })));
    expect(out).toContain('Remind customers to use their points');
    expect(out).toContain('You have {points} points at Striker Sports House, worth {worth}.');
    expect(out).not.toMatch(/guest/i);
  });

  it('the restaurant’s sheets are unchanged by default', () => {
    const p = { guests: overdueRows, business: 'Spice Garden', location: null, todayISO: '2026-11-28', onClose: () => {} };
    expect(render('en', createElement(MissYouSheet, { ...p, words: 'restaurant' }))).toBe(render('en', createElement(MissYouSheet, p)));
    expect(text(render('en', createElement(MissYouSheet, p)))).toContain('Miss you Craving Message');
  });
});

describe('where it sits and who opens it', () => {
  const href = '/reports/customers';

  it('a shop has it; a kitchen reaches it (and is sent to its Guests tab); a salon does not', () => {
    expect(areaAllows(href, SHOP)).toBe(true);
    expect(areaAllows(href, KITCHEN)).toBe(true);
    expect(areaAllows(href, DIARY_AREAS)).toBe(false);
    expect(src('./customers/page.tsx')).toContain("await sendRestaurantToTab('customers');");
    expect(RESTAURANT_TABS).toContain('customers');
  });

  it('like the money tabs: the owner and manager, not the fixed front desk or staff; a role needs Reports in its grid', () => {
    expect(canSee(href, 'owner', undefined, true, SHOP)).toBe(true);
    expect(canSee(href, 'manager', undefined, true, SHOP)).toBe(true);
    expect(canSee(href, 'receptionist', ['revenue'], true, SHOP)).toBe(false);
    expect(canSee(href, 'staff', undefined, true, SHOP)).toBe(false);
    const grid = (reports: 'none' | 'view') => ({ ...SHOP, pages: { bookings: 'manage', clients: 'manage', services: 'manage', reports } as const });
    expect(canSee(href, 'receptionist', undefined, true, grid('view'))).toBe(true);
    expect(canSee(href, 'receptionist', undefined, true, grid('none'))).toBe(false);
  });

  it('is the chip right after Discounts & free, and its page guards its own address and draws the shop’s words', () => {
    const nav = src('../components/RetailReportsNav.tsx');
    const at = (s: string) => nav.indexOf(s);
    expect(at("href: '/reports/customers'")).toBeGreaterThan(at("href: '/reports/discounts'"));
    expect(at("href: '/reports/customers'")).toBeLessThan(at("href: '/inventory/reports'"));
    expect(at("href: '/reports/customers'")).toBeLessThan(at("href: '/stock/channels'"));
    const page = src('./customers/page.tsx');
    expect(page).toContain("await guardScreen('/reports/customers');");
    expect(page).toContain('<RetailReportsNav active="customers" />');
    expect(src('./ShopCustomersReport.tsx')).toContain('<CustomersTab data={data} words="shop" />');
  });

  it('is decided by the screen, never by the business’s type', () => {
    for (const f of ['./ShopCustomersReport.tsx', './customer-words.ts', './customers/page.tsx']) expect(src(f)).not.toMatch(/tenant\.type|businessType|vertical ===/);
  });
});
