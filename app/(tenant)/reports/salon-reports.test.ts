import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { SalonChairsPage, SalonLoyaltyPage, SalonClientsPage, SalonOverviewPage, SalonSalesPage, SalonServicesPage, SalonTeamPage, SalonTipsPage } from '../lib/api-types';
import { SalonChairsTab, SalonLoyaltyTab, SalonClientsTab, SalonOverviewTab, SalonSalesTab, SalonServicesTab, SalonTeamTab, SalonTipsTab } from './SalonReports';
import { SALON_TABS } from './salon-tabs';
import { LabelsProvider } from '../components/LabelsProvider';

/**
 * The salon's Reports tabs, in the restaurant's layout, against the same owner rule (2026-11-24): one big number, at most
 * three small figures, one chart, lists of five, nothing drawn for a zero, and every word in easy English and in Hindi.
 * Glow Studio, a week in November: Priya and Fatima on the floor, haircuts and facials.
 */
const DEVANAGARI = /[ऀ-ॿ]/;
const window = { key: 'custom' as const, from: '2026-11-18', to: '2026-11-24', days: 7, previous: { from: '2026-11-11', to: '2026-11-17' } };

const overview: SalonOverviewPage = {
  window,
  sales: { value: 18_450_000, previous: 16_200_000, changePct: 13.9 },
  visits: { value: 142, previous: 130, changePct: 9.2 },
  averageVisitMinor: { value: 125_000, previous: 120_000 },
  noShows: { count: 6, minor: 540_000, previous: 4 },
  byDay: ['18', '19', '20', '21', '22', '23', '24'].map((d, i) => ({ day: `2026-11-${d}`, salesMinor: [2_100_000, 2_400_000, 0, 2_600_000, 2_900_000, 4_600_000, 3_850_000][i]! })),
  sources: [
    { key: 'whatsapp', salesMinor: 7_200_000, visits: 55 },
    { key: 'booked', salesMinor: 5_000_000, visits: 40 },
    { key: 'walk_in', salesMinor: 5_650_000, visits: 47 },
    { key: 'products', salesMinor: 600_000, visits: 9 },
  ],
  topService: { name: 'Hair Spa', count: 31, salesMinor: 4_650_000 },
  topPerson: { name: 'Priya', visits: 58, salesMinor: 7_800_000 },
  busiest: { hour: 17, visits: 24, sharePct: 17 },
};

const render = (el: ReactElement, locale: 'en' | 'hi' = 'en') =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'Asia/Kolkata', children: el }));

describe('Overview', () => {
  it('one big number (Sales), three small figures, the chart, and where the money came from', () => {
    const html = render(createElement(SalonOverviewTab, { data: overview, todayISO: '2026-11-24' }));
    expect(html).toContain('₹1,84,500');
    expect(html).toContain('↑ 14% vs the days before');
    // Average visit is the Sales tab's big number: each fact once.
    expect(html.match(/class="rr-small"/g)).toHaveLength(2);
    expect(html).not.toContain('Average visit');
    expect(html).toContain('No-shows');
    expect(html).toContain('6 · ₹5,400');
    expect(html).toContain('Booked on WhatsApp');
    expect(html).toContain('Walk-ins');
    expect(html).toContain('Hair Spa earned most');
    expect(html).toContain('Priya earned most');
    expect(html).toContain('Busiest time');
  });

  it('a week with no no-shows draws no "No-shows ₹0" (negative)', () => {
    const html = render(createElement(SalonOverviewTab, { data: { ...overview, noShows: { count: 0, minor: 0, previous: 0 } } }));
    expect(html).not.toContain('No-shows');
    expect(html.match(/class="rr-small"/g)).toHaveLength(1);
  });

  it('one source is no split; nothing at all is one line (boundary)', () => {
    const one = render(createElement(SalonOverviewTab, { data: { ...overview, sources: [overview.sources[0]!], topService: null, topPerson: null, busiest: null } }));
    expect(one).not.toContain('Where sales came from');
    const none = render(
      createElement(SalonOverviewTab, { data: { ...overview, sales: { value: 0, previous: null, changePct: null }, visits: { value: 0, previous: null, changePct: null }, noShows: { count: 0, minor: 0, previous: null } } }),
    );
    expect(none).toContain('No visits on these days yet.');
  });

  it('reads in Hindi', () => {
    const html = render(createElement(SalonOverviewTab, { data: overview }), 'hi');
    expect(html).toContain('बिक्री कहाँ से आई');
    expect(html).toMatch(DEVANAGARI);
  });
});

describe('Sales', () => {
  const sales: SalonSalesPage = {
    window,
    averageVisit: { value: 129_930, previous: null, changePct: null },
    discountsMinor: 120_000,
    refundsMinor: 0,
    busyHours: [
      { hour: 10, salesMinor: 1_200_000, visits: 10 },
      { hour: 17, salesMinor: 3_600_000, visits: 24 },
    ],
    byPayment: [
      { mode: 'upi', minor: 11_000_000 },
      { mode: 'cash', minor: 7_450_000 },
    ],
  };
  it('what a visit was worth, the discount, and no Refunds row at ₹0', () => {
    const html = render(createElement(SalonSalesTab, { data: sales }));
    expect(html).toContain('Average visit');
    expect(html).toContain('₹1,299');
    expect(html).not.toContain('Money in');
    expect(html).toContain('₹1,200');
    expect(html).not.toContain('Refunds');
    expect(html).not.toContain('vs the days before');
    expect(html).toContain('How people paid');
  });
  it('a day of counter sales only says there were no visits, never "₹0" (code review 2026-11-25)', () => {
    const html = render(createElement(SalonSalesTab, { data: { ...sales, averageVisit: null } }));
    expect(html).toContain('No visits on these days');
    // No big number at all (the chart's own scale still starts at ₹0).
    expect(html).not.toContain('class="cr-hero"');
  });
});

describe('Services', () => {
  const services: SalonServicesPage = {
    window,
    servicesDone: { value: 210, previous: 190, changePct: 10.5 },
    cancelled: { count: 4, minor: 360_000 },
    top: [
      { id: 's1', name: 'Hair Spa', count: 31, previousCount: 25, salesMinor: 4_650_000 },
      { id: 's2', name: 'Haircut', count: 70, previousCount: 72, salesMinor: 2_100_000 },
    ],
    topByCount: [
      { id: 's2', name: 'Haircut', count: 70, previousCount: 72, salesMinor: 2_100_000 },
      { id: 's1', name: 'Hair Spa', count: 31, previousCount: 25, salesMinor: 4_650_000 },
    ],
    doneCount: 9,
    movers: [{ name: 'Hair Spa', count: 31, previousCount: 25, diff: 6 }],
    barelyBooked: { rows: [{ name: 'Keratin', count: 0 }], count: 1, menuTotal: 24 },
    products: { rows: [{ name: 'Argan Oil Serum', qty: 6, minor: 540_000 }], count: 1 },
    packages: { rows: [{ name: 'Bridal Glow', count: 3, minor: 959_700 }], count: 1 },
  };
  it('services done, the cancelled bookings at their price, the top five, and the lists', () => {
    const html = render(createElement(SalonServicesTab, { data: services }));
    expect(html).toContain('Services done');
    expect(html).toContain('4 · ₹3,600');
    expect(html).toContain('7 more services were done');
    expect(html).toContain('Going up or down');
    expect(html).toContain('Argan Oil Serum');
    expect(html).toContain('Packages sold');
    expect(html).toContain('Bridal Glow');
    expect(html).toContain('₹9,597');
    expect(html).toContain('Hardly booked');
  });
});

describe('Team', () => {
  const team: SalonTeamPage = {
    window,
    working: 2,
    busyPct: 64,
    previousBusyPct: 58,
    people: [
      { id: 'p1', name: 'Priya', visits: 58, salesMinor: 7_800_000, previousSalesMinor: 7_000_000, averageMinor: 134_483, busyPct: 81, noShowPct: 3 },
      { id: 'p2', name: 'Fatima', visits: 50, salesMinor: 6_050_000, previousSalesMinor: 5_900_000, averageMinor: 121_000, busyPct: 47, noShowPct: 0 },
      { id: '', name: 'Unassigned', key: 'unassigned', visits: 34, salesMinor: 4_000_000, previousSalesMinor: null, averageMinor: 117_647, busyPct: null, noShowPct: null },
    ],
    freeTime: [{ id: 'p2', name: 'Fatima', busyPct: 47 }],
  };
  it('time booked, who earned it with their visits and how booked they were; free time is the Chairs tab’s', () => {
    const html = render(createElement(SalonTeamTab, { data: team }));
    expect(html).toContain('Time booked');
    expect(html).toContain('64%');
    expect(html).toContain('58% the days before');
    expect(html).toContain('81% booked');
    expect(html).not.toContain('0% no-shows');
    expect(html).not.toContain('Most free time');
    // The row for visits with no stylist reads in the one phrase the product uses for it, never "Unassigned".
    expect(html).not.toContain('Unassigned');
  });
});

describe('Chairs', () => {
  const chairs: SalonChairsPage = {
    window,
    emptyHours: 46,
    workingHours: 156,
    perBookedHourMinor: 98_000,
    busiestDay: { dow: 6, pct: 88 },
    quietestDay: { dow: 2, pct: 41 },
    grid: [
      { dow: 2, hour: 10, pct: 20, emptyHours: 8 },
      { dow: 2, hour: 11, pct: 55, emptyHours: 4 },
      { dow: 6, hour: 11, pct: 95, emptyHours: 0 },
    ],
    emptiest: [{ dow: 2, hour: 10, emptyHours: 8, pct: 20 }],
    people: [{ id: 'p2', name: 'Fatima', emptyHours: 21, pct: 61 }],
  };
  it('empty hours of working hours, a booked hour’s worth, busiest and quietest day, the grid and the emptiest times', () => {
    const html = render(createElement(SalonChairsTab, { data: chairs }));
    expect(html).toContain('46 hours');
    expect(html).toContain('of 156 working hours');
    expect(html).toContain('₹980');
    expect(html).toContain('Sat · 88% booked');
    expect(html).toContain('Tue · 41% booked');
    expect(html).toContain('rp-heat');
    // Saturday 10 o'clock nobody works: a blank cell, said as such, never an empty chair.
    expect(html).toContain('Sat 10 am: nobody works');
    expect(html).toContain('Emptiest times');
    expect(html).toContain('8 hours empty');
    expect(html).toContain('Fatima');
  });
  it('no working hours set: the way to fix it, not "0 hours" (negative); too long a window says so (boundary)', () => {
    expect(render(createElement(SalonChairsTab, { data: { ...chairs, emptyHours: null, grid: [], emptiest: [], people: [] } }))).toContain('Set each person');
    expect(render(createElement(SalonChairsTab, { data: { ...chairs, tooLong: true } }))).toContain('Pick up to 92 days');
  });
  it('reads in Hindi', () => {
    expect(render(createElement(SalonChairsTab, { data: chairs }), 'hi')).toContain('ख़ाली घंटे');
  });
});

describe('Loyalty', () => {
  const loyalty: SalonLoyaltyPage = {
    windows: { from: '2026-10-19', to: '2026-11-17', previous: { from: '2026-09-19', to: '2026-10-18' } },
    rebookPct: 38,
    previousRebookPct: 31,
    visits: 412,
    rebooked: 157,
    usualGapDays: 33,
    yearSpendPerClientMinor: 742_000,
    lost: 58,
    curve: [
      { month: 1, clients: 120, came: 52, pct: 43 },
      { month: 6, clients: 8, came: 3, pct: null },
    ],
    people: [{ id: 'p1', name: 'Priya', visits: 140, rebookPct: 46 }],
    serviceGaps: [{ name: 'Haircut', returns: 210, days: 34 }],
  };
  it('the rebooking rate with what it is out of and the 30 days before, the habit, the curve and the lists', () => {
    const html = render(createElement(SalonLoyaltyTab, { data: loyalty }));
    expect(html).toContain('Rebooking rate');
    expect(html).toContain('38%');
    expect(html).toContain('157 of 412 visits');
    expect(html).toContain('31% the 30 days before');
    expect(html).toContain('33 days');
    expect(html).toContain('₹7,420');
    expect(html).toContain('Still coming back');
    expect(html).toContain('Under 10 clients');
    expect(html).toContain('Priya');
    expect(html).toContain('in 34 days');
  });
  it('nothing to judge yet says so, never "0%" (boundary); a clinic has no stylist list (negative)', () => {
    const html = render(createElement(SalonLoyaltyTab, { data: { ...loyalty, rebookPct: null, previousRebookPct: null, visits: 0, rebooked: 0, people: null } }));
    expect(html).toContain('No visits to judge yet');
    expect(html).not.toContain('Rebooking by stylist');
  });
});

describe('Clients', () => {
  const clients: SalonClientsPage = {
    window,
    cameBack: { value: 96, previous: 90, changePct: 6.7 },
    newClients: { value: 31, previous: 28, changePct: 10.7 },
    clientCount: 127,
    topShare: { guests: 26, pct: 48 },
    returnByMonth: [
      { month: '2026-08', newGuests: 40, cameBack: 22, pct: 55, partial: false },
      { month: '2026-11', newGuests: 31, cameBack: 5, pct: 16, partial: true },
    ],
    returnDays: 60,
    overdue: { count: 1, rows: [{ customerId: 'c1', name: 'Meera Joshi', phone: '+91 98111 00105', usualGapDays: 28, lastSeenDaysAgo: 35 }] },
    top: [{ customerId: 'c2', name: 'Asha Mehta', visits: 3, salesMinor: 420_000 }],
  };
  it('who came back, new clients, the 60-day return chart, clients to message on WhatsApp, the top five', () => {
    const html = render(createElement(SalonClientsTab, { data: clients }));
    expect(html).toContain('Clients who came back');
    expect(html).toContain('within 60 days');
    expect(html).toContain('Meera Joshi');
    expect(html).toContain('wa.me/919811100105');
    expect(html).toContain('Asha Mehta');
  });
  it('a clinic reads its own noun: "Patients who came back", not "Clients" (CLAUDE.md: nouns from ctx.labels)', () => {
    const html = render(createElement(LabelsProvider, { labels: { customers: 'Patients', provider: 'Doctor' }, children: createElement(SalonClientsTab, { data: clients }) }));
    expect(html).toContain('Patients who came back');
    expect(html).toContain('New patients');
    expect(html).toContain('Patients to message');
    expect(html).not.toContain('Clients who came back');
  });
  it('someone who may not see clients sees the count, never a name (negative)', () => {
    const html = render(createElement(SalonClientsTab, { data: { ...clients, overdue: { count: 4, rows: [] }, top: [{ customerId: null, name: null, visits: 3, salesMinor: null }] } }));
    expect(html).toContain('4 clients are past their usual visit.');
    expect(html).not.toContain('Meera');
    expect(html).not.toContain('₹4,200');
  });
});

describe('Tips', () => {
  const tips: SalonTipsPage = {
    windows: { from: '2026-11-17', to: '2026-11-23', previous: { from: '2026-11-10', to: '2026-11-16' } },
    visits: 142,
    minVisits: 10,
    tips: [{ rule: 'no_shows', sure: 'high', visits: 142, payload: { rule: 'no_shows', count: 6, previous: 2, minor: 540_000, ratePct: 4 } }],
  };
  it('a tip is four short lines and opens its tab; under ten visits it says so', () => {
    const html = render(createElement(SalonTipsTab, { data: tips, onOpen: () => {} }));
    expect(html).toContain('6 clients booked and did not come.');
    expect(html).toContain('₹5,400 at the booked price');
    expect(html).toContain('Very sure (142 visits)');
    expect(html).toContain('Open · Overview');
    expect(html).toContain('The week before: 2.');
    // Not known (the salon was not open all that week): nothing said about it, never "0" (code review 2026-11-25).
    const unknown = render(
      createElement(SalonTipsTab, { data: { ...tips, tips: [{ ...tips.tips[0]!, payload: { rule: 'no_shows', count: 6, previous: null, minor: 540_000, ratePct: 4 } }] } }),
    );
    expect(unknown).not.toContain('The week before');
    const few = render(createElement(SalonTipsTab, { data: { ...tips, visits: 4, tips: [] } }));
    expect(few).toContain('Tips start after 10 visits a week.');
  });
});

describe('the screen', () => {
  const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('./SalonReports.tsx', import.meta.url), 'utf8');
  it('a salon owner opens the six tabs; a plan with no team leaderboard has no Team tab', () => {
    expect(SALON_TABS).toEqual(['overview', 'sales', 'services', 'team', 'chairs', 'clients', 'loyalty', 'tips']);
    expect(page).toContain('hasTeam={staffTabAvailable}');
    expect(screen).toContain("SALON_TABS.filter((k) => (k !== 'team' && k !== 'chairs') || hasTeam)");
    // Owner, 2026-11-25 — the older tabs (CSV, Filters, What to do) stay one tap away under "More reports".
    expect(page).toContain("<h2 className=\"cr-more\">{t('counterMore')}</h2>");
    expect(page).toContain('href={`/reports?tab=${key}`}');
    // Loyalty and Tips read their own fixed windows: no date picker on either.
    expect(screen).toContain('hidden={FIXED_WINDOW_TABS.includes(tab)}');
  });
  it('every tab has its words in English and Hindi, key for key', () => {
    const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(hi.salonReports).sort()).toEqual(keys(en.salonReports).sort());
  });
});
