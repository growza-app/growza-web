import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { RestaurantItemsPage, RestaurantOverviewPage, RestaurantSalesPage, RestaurantTipsPage } from '../lib/api-types';
import { ItemsTab, OverviewTab, SalesTab, TipsTab } from './RestaurantReports';

/**
 * Jira GRW-758 — the restaurant's Reports tabs, against the owner's rule of 2026-11-24: "very clean and precise, not too
 * much noise" — one big number, at most three small figures, one chart, lists of five, nothing drawn for a zero, one line
 * under a figure, and every word in easy English and in Hindi. The payloads carry figures only.
 */
const DEVANAGARI = /[ऀ-ॿ]/;
const window = { key: 'custom' as const, from: '2026-11-18', to: '2026-11-24', days: 7, previous: { from: '2026-11-11', to: '2026-11-17' } };
const fresh = { builtAt: '2026-11-23T21:35:00Z', liveDays: 1 };

const overview: RestaurantOverviewPage = {
  window,
  sales: { value: 28_700_000, previous: 36_400_000, changePct: -21.2 },
  bills: { value: 512, previous: 540, changePct: -5.2 },
  averageBillMinor: { value: 56_055, previous: 67_407 },
  profit: { profitMinor: 9_870_000, marginPct: 36.7, uncostedSalesMinor: 1_800_000 },
  byDay: ['18', '19', '20', '21', '22', '23', '24'].map((d, i) => ({ day: `2026-11-${d}`, salesMinor: [3_900_000, 4_100_000, 0, 4_800_000, 5_200_000, 6_100_000, 4_600_000][i]! })),
  freshness: fresh,
};
const sales: RestaurantSalesPage = {
  window,
  moneyIn: { value: 24_400_000, previous: null, changePct: null },
  discountsMinor: 40_000,
  refundsMinor: 0,
  deliveryCutMinor: 0,
  serviceChargeMinor: 960_000,
  taxMinor: 480_000,
  busyHours: [
    { hour: 12, salesMinor: 4_800_000, bills: 90 },
    { hour: 13, salesMinor: 3_600_000, bills: 70 },
    { hour: 20, salesMinor: 9_600_000, bills: 160 },
  ],
  byPayment: [
    { mode: 'cash', minor: 15_840_000 },
    { mode: 'upi', minor: 5_600_000 },
    { mode: 'card', minor: 2_960_000 },
  ],
  byOrderType: [
    { type: 'dine_in', salesMinor: 17_300_000, bills: 300 },
    { type: 'takeaway', salesMinor: 3_600_000, bills: 110 },
  ],
  byChannel: [{ channel: 'counter', salesMinor: 20_900_000, bills: 410 }],
  freshness: fresh,
};
const items: RestaurantItemsPage = {
  window,
  dishesSold: { value: 1_740, previous: 1_400, changePct: 24.3 },
  cancelled: { qty: 23, minor: 598_000, thrownQty: 9 },
  top: [
    { name: 'Butter Chicken', productId: 'p1', qty: 300, previousQty: 260, salesMinor: 10_200_000, profitMinor: 5_400_000 },
    { name: 'Paneer Tikka', productId: 'p2', qty: 300, previousQty: 280, salesMinor: 7_800_000, profitMinor: 3_900_000 },
    { name: 'Garlic Naan', productId: 'p3', qty: 600, previousQty: 590, salesMinor: 4_200_000, profitMinor: 3_300_000 },
    { name: 'Dal Makhani', productId: 'p4', qty: 100, previousQty: 120, salesMinor: 2_400_000, profitMinor: 1_700_000 },
    { name: 'Gulab Jamun', productId: 'p5', qty: 200, previousQty: 150, salesMinor: 1_800_000, profitMinor: null },
  ],
  sellingCount: 31,
  notSelling: { names: ['Kulfi', 'Mutton Rogan Josh', 'Rasmalai'], count: 3 },
  freshness: fresh,
};

const render = (locale: 'en' | 'hi', el: ReactElement) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'Asia/Kolkata', children: el }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const count = (html: string, cls: string) => html.split(`class="${cls}"`).length - 1 + html.split(`class="${cls} `).length - 1;

describe('Overview', () => {
  const html = render('en', createElement(OverviewTab, { data: overview }));
  const out = text(html);

  it('leads with Sales and one line under it', () => {
    expect(out).toContain('Sales ₹2,87,000');
    expect(out).toContain('↓ 21% vs the days before');
  });

  it('has three small figures — bills, average bill, profit — and one chart', () => {
    expect(count(html, 'rr-small')).toBe(3);
    expect(out).toContain('Bills 512');
    expect(out).toContain('Average bill ₹561');
    expect(out).toContain('Profit ₹98,700');
    expect(count(html, 'cr-bars cr-bars-day rr-bars')).toBe(1);
  });

  it('draws no profit for someone who may not see cost', () => {
    const hidden = text(render('en', createElement(OverviewTab, { data: { ...overview, profit: null } })));
    expect(hidden).not.toContain('Profit');
  });

  it('says plainly when nothing sold, rather than drawing ₹0', () => {
    const none = text(render('en', createElement(OverviewTab, { data: { ...overview, sales: { value: 0, previous: null, changePct: null }, bills: { value: 0, previous: null, changePct: null } } })));
    expect(none).toBe('No sales on these days yet.');
  });
});

describe('Sales', () => {
  const html = render('en', createElement(SalesTab, { data: sales }));
  const out = text(html);

  it('Money in is the big number, with no "vs" line when there is nothing before', () => {
    expect(out).toContain('Money in ₹2,44,000');
    expect(out).not.toContain('vs the days before');
  });

  it('leaves out a figure that is zero: no refunds and no app cut this week', () => {
    expect(out).toContain('Discounts ₹400');
    expect(out).not.toContain('Refunds');
    expect(out).not.toContain('Delivery app cut');
  });

  it('busy times run from the first hour that sold to the last; two lists in plain words', () => {
    expect(out).toContain('Busy times');
    expect(out).toContain('How people paid Cash ₹1,58,400 UPI ₹56,000 Card ₹29,600');
    expect(out).toContain('How it was eaten Dine-in 300 bills ₹1,73,000 Takeaway 110 bills ₹36,000');
  });
});

describe('Items', () => {
  const html = render('en', createElement(ItemsTab, { data: items }));
  const out = text(html);

  it('Dishes sold, the cancelled figure behind "See all", the top five with profit', () => {
    expect(out).toContain('Dishes sold 1,740');
    expect(out).toContain('↑ 24% vs the days before');
    expect(out).toContain('Cancelled dishes 23 · ₹5,980 See all');
    expect(out).toContain('Butter Chicken 300 plates · profit ₹54,000 ₹1,02,000');
    // Gulab Jamun has no cost price: no profit said, never ₹0.
    expect(out).toContain('Gulab Jamun 200 plates ₹18,000');
    expect(out).toContain('and 26 more dishes sold');
  });

  it('names what is not selling once, and never as advice', () => {
    expect(out).toContain('Not selling Kulfi Mutton Rogan Josh Rasmalai');
    expect(out).not.toMatch(/stop|try|push|offer/i);
  });

  it('every list holds five rows at most', () => {
    const many = { ...items, notSelling: { names: ['A', 'B', 'C', 'D', 'E'], count: 12 } };
    const o = text(render('en', createElement(ItemsTab, { data: many })));
    expect(o).toContain('and 7 more');
  });
});

describe('Hindi', () => {
  it('every tab is in Hindi, the numbers in Indian commas', () => {
    for (const el of [createElement(OverviewTab, { data: overview }), createElement(SalesTab, { data: sales }), createElement(ItemsTab, { data: items })]) {
      const out = text(render('hi', el));
      expect(out).toMatch(DEVANAGARI);
      for (const english of ['Sales', 'Money in', 'Dishes sold', 'Bills', 'See all', 'vs the days before']) expect(out).not.toContain(english);
    }
  });

  it('has a Hindi word for every English one', () => {
    const keys = (o: unknown, p = ''): string[] =>
      o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : [p.slice(0, -1)];
    expect(keys(hi.restaurantReports).sort()).toEqual(keys(en.restaurantReports).sort());
  });
});

describe('plain words', () => {
  it('never says net, gross, margin, KPI, variance or insight', () => {
    expect(JSON.stringify(en.restaurantReports)).not.toMatch(/\b(net|gross|margin|kpi|variance|insight)\b/i);
  });
});

describe('Jira GRW-759 — Tips', () => {
  const windows = { from: '2026-11-17', to: '2026-11-23', previousFrom: '2026-11-10', previousTo: '2026-11-16' };
  const tips: RestaurantTipsPage = {
    bills: 930,
    minBills: 20,
    builtAt: '2026-11-23T21:40:00Z',
    stale: false,
    tips: [
      { rule: 'sales_change', effect: 6_500_000, sure: 'very', bills: 1_990, windows,
        payload: { rule: 'sales_change', sales: 41_000_000, previousSales: 47_500_000, bills: 930, previousBills: 1_060, averageBill: 44_086, previousAverageBill: 44_811, pct: -13.7 } },
      { rule: 'cancelled', effect: 598_000, sure: 'very', bills: 930, windows,
        payload: { rule: 'cancelled', qty: 23, minor: 598_000, pctOfSales: 1.5, topReason: 'Wrong order', topReasonQty: 14 } },
      { rule: 'dish_move', effect: 150_000, sure: 'fairly', bills: 60, windows,
        payload: { rule: 'dish_move', name: 'Lassi', qty: 5, previousQty: 20, sales: 50_000, previousSales: 200_000, pct: -75 } },
    ],
  };

  it('AC-01 — sales went down 14%: both weeks, the bills, why, one thing to try, how sure', () => {
    const out = text(render('en', createElement(TipsTab, { data: tips })));
    expect(out).toContain('Sales went down 14%.');
    expect(out).toContain('This week ₹4,10,000 from 930 bills. The week before ₹4,75,000 from 1060 bills.');
    expect(out).toContain('Fewer people came; each spent about the same.');
    expect(out).toContain('Look at these days in Orders.');
    expect(out).toContain('Very sure (1990 bills)');
  });

  it('cancelled and dish tips say their numbers and nothing more', () => {
    const out = text(render('en', createElement(TipsTab, { data: tips })));
    expect(out).toContain('23 dishes were cancelled. ₹5,980 at menu price — 2% of sales. Most said: “Wrong order” (14).');
    expect(out).toContain('Lassi is selling less. This week 5 plates, ₹500. The week before 20 plates, ₹2,000.');
    expect(out).toContain('Fairly sure (60 bills)');
  });

  it('at most three, and one line when there is nothing to say', () => {
    const html = render('en', createElement(TipsTab, { data: tips }));
    expect(count(html, 'cr-card rr-tip')).toBe(3);
    expect(text(render('en', createElement(TipsTab, { data: { ...tips, tips: [] } })))).toBe('All normal this week.');
    expect(text(render('en', createElement(TipsTab, { data: { ...tips, tips: [], bills: 12 } })))).toBe('Not enough sales yet. Tips start after about 20 bills a week.');
  });

  it('AC-04 — tips from an earlier night say so', () => {
    expect(text(render('en', createElement(TipsTab, { data: { ...tips, stale: true } })))).toContain('tips are not ready yet.');
  });

  it('in Hindi, every sentence', () => {
    const out = text(render('hi', createElement(TipsTab, { data: tips })));
    expect(out).toMatch(DEVANAGARI);
    expect(out).toContain('बिक्री 14% घटी।');
    for (const english of ['Sales went', 'This week', 'Very sure', 'dishes were cancelled']) expect(out).not.toContain(english);
  });

  it('never tells the owner what they must do, and never says "because"', () => {
    expect(JSON.stringify(en.restaurantReports.tips)).not.toMatch(/\b(must|should|because)\b/i);
  });
});

describe('Jira GRW-760 — the kitchen’s cost tips', () => {
  const windows = { from: '2026-11-17', to: '2026-11-23', previousFrom: '2026-11-10', previousTo: '2026-11-16' };
  const page: RestaurantTipsPage = {
    bills: 140, minBills: 20, builtAt: '2026-11-23T21:40:00Z', stale: false, recipesShort: false,
    tips: [
      { rule: 'dish_cost_up', needs: 'cost', effect: 28_000, sure: 'fairly', bills: 140, windows,
        payload: { rule: 'dish_cost_up', name: 'Paneer Tikka', perPlate: 10_700, previousPerPlate: 8_300, qty: 142, extraMonthly: 340_800, ingredient: { name: 'Paneer', unit: 'kg', price: 39_000, previousPrice: 32_000 } } },
      { rule: 'food_wasted', needs: 'cost', effect: 620_000, sure: 'very', bills: 140, windows,
        payload: { rule: 'food_wasted', wastedMinor: 620_000, usedMinor: 9_000_000, pct: 6.9, material: 'Milk', reason: 'expired' } },
      { rule: 'count_short', needs: 'cost', effect: 156_000, sure: 'very', bills: 140, windows,
        payload: { rule: 'count_short', name: 'Chicken', unit: 'kg', diffQty: -4_000, expectedQty: 20_000, diffMinor: -156_000, pct: 20 } },
    ],
  };

  it('AC-01 — the dish, both costs, the ingredient that rose, and the estimate with its assumption', () => {
    const out = text(render('en', createElement(TipsTab, { data: page })));
    expect(out).toContain('Paneer Tikka costs more to make: ₹107 a plate, was ₹83.');
    expect(out).toContain('Paneer went from ₹320 to ₹390 a kg. About ₹3,408 more a month, if you sell as many.');
    expect(out).toContain('₹6,200 of food was thrown away this week. 7% of the food used. Most was Milk (expired).');
    expect(out).toContain('Chicken: you counted 4 kg less than expected. 20% short of 20 kg — ₹1,560.');
  });

  it('AC-03 — too few recipes: one line asking for them', () => {
    const out = text(render('en', createElement(TipsTab, { data: { ...page, tips: [], recipesShort: true } })));
    expect(out).toContain('Add recipes to more dishes to see food cost tips.');
  });

  it('in Hindi', () => {
    const out = text(render('hi', createElement(TipsTab, { data: page })));
    expect(out).toContain('किलो');
    expect(out).not.toMatch(/costs more|thrown away|you counted/);
  });

  it('never says variance or COGS', () => {
    expect(JSON.stringify(en.restaurantReports.tips)).not.toMatch(/variance|cogs/i);
  });
});
