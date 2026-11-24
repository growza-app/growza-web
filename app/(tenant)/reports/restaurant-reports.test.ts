import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { RestaurantCustomersPage, RestaurantItemsPage, RestaurantOverviewPage, RestaurantSalesPage, RestaurantTipsPage } from '../lib/api-types';
import { CustomersTab, ItemsTab, OverviewTab, SalesTab, TipsTab } from './RestaurantReports';

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

  it('owner, 2026-11-24 — no dish has a cost price: no profit figure, never ₹0, and how many dishes to fix', () => {
    const p = { profitMinor: null, marginPct: null, costedSalesMinor: 0, salesMinor: 28_700_000, uncostedSalesMinor: 28_700_000, missingDishes: 31, thrownMinor: 0 };
    const html = render('en', createElement(OverviewTab, { data: { ...overview, profit: p } }));
    const none = text(html);
    expect(none).toContain('Profit No dish costs yet 31 dishes have no cost price or recipe');
    expect(none).not.toMatch(/Profit ₹/);
    expect(text(render('hi', createElement(OverviewTab, { data: { ...overview, profit: p } })))).toContain('अभी किसी डिश की लागत नहीं');
  });

  it('owner, 2026-11-24 — some dishes have no cost price: the profit says what sales it is over, and how many are missing', () => {
    const p = { profitMinor: 9_870_000, marginPct: 36.7, costedSalesMinor: 26_900_000, salesMinor: 28_700_000, uncostedSalesMinor: 1_800_000, missingDishes: 1, thrownMinor: 0 };
    const part = text(render('en', createElement(OverviewTab, { data: { ...overview, profit: p } })));
    expect(part).toContain('Profit ₹98,700 On ₹2,69,000 of ₹2,87,000 sales 1 dish has no cost price or recipe');
  });

  it('every dish has a cost price: no coverage line', () => {
    const p = { profitMinor: 9_870_000, marginPct: 34.4, costedSalesMinor: 28_700_000, salesMinor: 28_700_000, uncostedSalesMinor: 0, missingDishes: 0, thrownMinor: 0 };
    const all = text(render('en', createElement(OverviewTab, { data: { ...overview, profit: p } })));
    expect(all).not.toContain('no cost price');
    expect(all).not.toMatch(/On ₹[\d,]+ of/);
  });

  describe('owner, 2026-11-24 — under the chart: where sales came from, and worth a look', () => {
    const more = {
      ...overview,
      sources: [
        { key: 'dine_in', salesMinor: 16_646_000 },
        { key: 'swiggy', salesMinor: 6_888_000 },
        { key: 'takeaway', salesMinor: 5_166_000 },
      ],
      topDish: { name: 'Butter Chicken', qty: 300, salesMinor: 10_200_000 },
      busiest: { hour: 20, bills: 128, sharePct: 25 },
    };
    const out = text(render('en', createElement(OverviewTab, { data: more, tipCount: 1, onOpen: () => {} })));

    it('the split names every source with its amount and share', () => {
      expect(out).toContain('Where sales came from Dine-in ₹1,66,460 · 58% Swiggy ₹68,880 · 24% Takeaway ₹51,660 · 18%');
    });
    it('worth a look: the top dish, the busiest hour, the tips', () => {
      expect(out).toContain('Worth a look Butter Chicken sold most 300 plates · ₹1,02,000');
      expect(out).toContain('Busiest time 8 pm–9 pm 128 bills · 25% of all bills');
      expect(out).toContain('1 tip this week What changed, and what to try');
    });
    it('a takeaway-only kitchen with no app: one source, so no split — worth a look still there', () => {
      const one = text(render('en', createElement(OverviewTab, { data: { ...more, sources: [{ key: 'takeaway', salesMinor: 28_700_000 }] }, tipCount: 0 })));
      expect(one).not.toContain('Where sales came from');
      expect(one).toContain('Butter Chicken sold most');
      // No tips this week: that line is left out, not "0 tips".
      expect(one).not.toContain('tip this week');
      expect(one).not.toContain('tips this week');
    });
    it('an older API with none of it: nothing under the chart', () => {
      const old = text(render('en', createElement(OverviewTab, { data: overview })));
      expect(old).not.toContain('Worth a look');
      expect(old).not.toContain('Where sales came from');
    });
    it('Hindi', () => {
      const hi = text(render('hi', createElement(OverviewTab, { data: more, tipCount: 2, onOpen: () => {} })));
      expect(hi).toContain('बिक्री कहाँ से आई');
      expect(hi).toContain('Butter Chicken सबसे ज़्यादा बिका');
      expect(hi).toContain('इस हफ़्ते 2 सुझाव');
    });
  });

  it('says plainly when nothing sold, rather than drawing ₹0', () => {
    const none = text(render('en', createElement(OverviewTab, { data: { ...overview, sales: { value: 0, previous: null, changePct: null }, bills: { value: 0, previous: null, changePct: null } } })));
    expect(none).toBe('No sales on these days yet.');
  });
});

describe('Sales', () => {
  it('owner, 2026-11-24 — spend per head; with discounts, app cut and per head, Refunds makes way (three small figures)', () => {
    const perHead = { salesMinor: 10_080_000, guests: 312, tables: 118, perHeadMinor: 32_308 };
    const one = text(render('en', createElement(SalesTab, { data: { ...sales, perHead } })));
    expect(one).toContain('Spend per head ₹323 Dine-in · 312 guests at 118 tables');
    const full = render('en', createElement(SalesTab, { data: { ...sales, refundsMinor: 50_000, deliveryCutMinor: 373_000, perHead } }));
    expect(count(full, 'rr-small')).toBe(3);
    expect(text(full)).not.toContain('Refunds');
    // No table said how many sat down: no figure.
    expect(text(render('en', createElement(SalesTab, { data: { ...sales, perHead: null } })))).not.toContain('Spend per head');
  });

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

  it('busy times run from the first hour that sold to the last; how people paid in plain words', () => {
    expect(out).toContain('Busy times');
    expect(out).toContain('How people paid Cash ₹1,58,400 UPI ₹56,000 Card ₹29,600');
    // Owner, 2026-11-24 — moved to the Overview as "Where sales came from": each fact once.
    expect(out).not.toContain('How it was eaten');
  });
});

describe('Items', () => {
  const html = render('en', createElement(ItemsTab, { data: items }));
  const out = text(html);

  it('Dishes sold, the cancelled figure behind "See all", the top five with profit', () => {
    expect(out).toContain('Dishes sold 1,740');
    expect(out).toContain('↑ 24% vs the days before');
    expect(out).toContain('Cancelled dishes 23 · ₹5,980 9 after cooking See all');
    expect(out).toContain('Butter Chicken 300 plates · profit ₹54,000 ₹1,02,000');
    // Gulab Jamun has no cost price: it says so (owner, 2026-11-24), never a profit of ₹0.
    expect(out).toContain('Gulab Jamun 200 plates · no cost price or recipe ₹18,000');
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

  it('owner, 2026-11-24 — the dish that brings new guests back: its share against everyone, a link not proof, guests not bills', () => {
    const t = { ...tips, tips: [{ rule: 'dish_brings_back' as const, effect: 450_000, sure: 'fairly' as const, bills: 52, windows,
      payload: { rule: 'dish_brings_back' as const, name: 'Butter Chicken', firstTimers: 52, cameBack: 24, pct: 46, allFirstTimers: 200, allPct: 31, from: '2026-07-27', to: '2026-10-24' } }] };
    const out = text(render('en', createElement(TipsTab, { data: t, onOpen: () => {} })));
    expect(out).toContain('Butter Chicken brings new guests back');
    expect(out).toContain('New guests who ordered it: 46% came back within 30 days. All new guests: 31%.');
    expect(out).toContain('It shows a link, not proof.');
    expect(out).toContain('Fairly sure (52 new guests)');
    expect(out).toContain('Open · Items');
  });

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

describe('the server page and the client component', () => {
  it('the page reads the tab list from a plain module — a value from a "use client" file is only a reference on the server', async () => {
    const { readFileSync } = await import('node:fs');
    const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
    expect(page).toContain("import { RESTAURANT_TABS, type RestaurantTab } from './restaurant-tabs';");
    expect(page).toMatch(/import \{ RestaurantReports \} from '\.\/RestaurantReports';/);
    expect(readFileSync(new URL('./restaurant-tabs.ts', import.meta.url), 'utf8')).not.toMatch(/^\s*['"]use client['"]/m);
  });
});

describe('Jira GRW-761 — Customers', () => {
  const cust: RestaurantCustomersPage = {
    window,
    cameBack: { value: 68, previous: 52, changePct: 30.8 },
    newGuests: { value: 112, previous: 96, changePct: 16.7 },
    capturePct: 64,
    bills: 280,
    lowCapture: false,
    guestCount: 180,
    top: [
      { customerId: 'c1', name: 'Asha Verma', visits: 4, salesMinor: 182_000 },
      { customerId: 'c2', name: 'Bilal Khan', visits: 3, salesMinor: 96_000 },
    ],
  };

  it('AC-01 — came back is the big number; new guests and bills with a number beside it; the top guests', () => {
    const html = render('en', createElement(CustomersTab, { data: cust }));
    const out = text(html);
    expect(out).toContain('Guests who came back 68');
    expect(out).toContain('↑ 31% vs the days before');
    expect(out).toContain('New guests 112');
    expect(out).toContain('Bills with a number 64%');
    expect(out).toContain('Asha Verma 4 visits ₹1,820');
    expect(count(html, 'rr-small')).toBe(2);
  });

  it('AC-02 — no names for someone not allowed to see guests', () => {
    const out = text(render('en', createElement(CustomersTab, { data: { ...cust, top: cust.top.map((g) => ({ ...g, customerId: null, name: null, salesMinor: null })) } })));
    expect(out).not.toContain('Asha');
    expect(out).toContain('Guest 4 visits');
  });

  it('AC-03 — under 30% of bills with a number, the line asking for numbers replaces the figures', () => {
    const out = text(render('en', createElement(CustomersTab, { data: { ...cust, capturePct: 18, lowCapture: true } })));
    expect(out).toContain("Add the guest");
    expect(out).toContain('Only 18% of bills have a number.');
    expect(out).not.toContain('New guests');
  });

  it('in Hindi', () => {
    const out = text(render('hi', createElement(CustomersTab, { data: cust })));
    expect(out).toContain('दोबारा आए मेहमान 68');
    expect(out).not.toMatch(/came back|New guests/);
  });

  describe('owner, 2026-11-24 — habits: return rate by month, overdue regulars, the top fifth', () => {
    it('build all six #1 — months before the first new guest are left out', () => {
      const months = [
        { month: '2026-08', newGuests: 0, cameBack: 0, pct: null, partial: false },
        { month: '2026-09', newGuests: 0, cameBack: 0, pct: null, partial: false },
        { month: '2026-10', newGuests: 92, cameBack: 83, pct: 90, partial: false },
        { month: '2026-11', newGuests: 26, cameBack: 18, pct: 69, partial: true },
      ];
      const html = render('en', createElement(CustomersTab, { data: { ...cust, returnByMonth: months } }));
      expect(count(html, 'cr-bar-col')).toBe(2);
      expect(text(html)).toContain('9 in 10 new guests come back within 30 days Oct: 83 of 92 · Nov so far: 18 of 26');
    });
    it('build all six #6 — top guests: a rank and "Most visits in these dates"', () => {
      expect(text(render('en', createElement(CustomersTab, { data: cust })))).toContain('Top guests Most visits in these dates 1 AV Asha Verma 4 visits ₹1,820 2 BK Bilal Khan');
    });

    const habits = {
      ...cust,
      topShare: { guests: 22, pct: 61 },
      returnByMonth: [
        { month: '2026-08', newGuests: 6, cameBack: 3, pct: null, partial: false },
        { month: '2026-09', newGuests: 41, cameBack: 14, pct: 34, partial: false },
        { month: '2026-10', newGuests: 38, cameBack: 11, pct: 29, partial: true },
        { month: '2026-11', newGuests: 26, cameBack: 10, pct: 38, partial: true },
      ],
      overdue: {
        count: 7,
        rows: Array.from({ length: 7 }, (_, i) => ({ customerId: `g${i}`, name: i === 0 ? 'Priya Sharma' : `Guest ${i}`, phone: `+91 98100 0000${i}`, visits: 9 - i, usualGapDays: 6, lastSeenDaysAgo: 15 + i })),
      },
    };
    const html = render('en', createElement(CustomersTab, { data: habits }));
    const out = text(html);

    it('three small figures: new guests, bills with a number, the top fifth', () => {
      expect(out).toContain('Top 20% of guests bring 61% of sales');
      expect(count(html, 'rr-small')).toBe(3);
    });
    it('the chart: four months, a share over each, a dash under 10 new guests, the months still open marked', () => {
      // Owner, "build all six" #1: a month before any new guest is left out; August had 6, so it stays.
      expect(out).toContain('New guests who came back within 30 days By the month of their first visit');
      // The big figure is over the settled months that can be said: September alone, 14 of 41 → 3 in 10. Then each month.
      expect(out).toContain('3 in 10 new guests come back within 30 days Sept: 14 of 41 · Oct so far: 11 of 38 · Nov so far: 10 of 26');
      expect(out).toMatch(/– Aug.*34% Sep.*29% Oct\*.*38% Nov\*/);
      expect(out).toContain('new guests still have days left to come back.');
      expect(out).toContain('– Under 10 new guests: too few to say.');
    });
    it('overdue regulars: five, then See all; each with their habit and a WhatsApp chat link with a hello', () => {
      expect(out).toContain('Regulars who are overdue · 7 Away twice as long as they usually are');
      // Initials, the habit, how late — and a round WhatsApp button named for her.
      expect(out).toContain('PS Priya Sharma Usually every 6 days 15 days away');
      expect(html).toContain('aria-label="Message Priya Sharma on WhatsApp"');
      expect(count(html, 'rr-wa')).toBe(5);
      expect(out).toContain('See all 7');
      expect(html).toContain('href="https://wa.me/919810000000?text=Hi%20Priya%20Sharma%2C"');
    });
    it('someone who may not see guests: the count, no names, no numbers', () => {
      const staff = text(render('en', createElement(CustomersTab, { data: { ...habits, overdue: { count: 7, rows: [] } } })));
      expect(staff).toContain('7 regulars are overdue.');
      expect(staff).not.toContain('Priya');
    });
    it('Hindi', () => {
      const hi = text(render('hi', createElement(CustomersTab, { data: habits })));
      expect(hi).toContain('नए मेहमान जो 30 दिन में फिर आए');
      expect(hi).toContain('नियमित मेहमान जो देर से आ रहे हैं');
    });
  });

  it('never says retention, cohort or CLV', () => {
    expect(JSON.stringify(en.restaurantReports.customers)).not.toMatch(/retention|cohort|\bclv\b/i);
  });
});

describe('QA 2026-11-24', () => {
  const source = readFileSync(new URL('./RestaurantReports.tsx', import.meta.url), 'utf8');
  it('#7 — the cache key carries the branches this person sees, so two businesses never share an entry', () => {
    expect(source).toMatch(/const who = `[^`]*branches\.map\(\(b\) => b\.id\)/);
  });
  it('#2 — a dish from a whole order cancelled says so where a reason would be', () => {
    expect(source).toContain("r.wholeOrder ? t('items.wholeOrder') : r.reason");
  });
});
