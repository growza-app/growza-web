import { describe, expect, it } from 'vitest';

import { copy } from '../lib/copy';
import { csvFilename, reportToCsv } from './export';
import type { TabPayload } from './ReportsClient';

/**
 * The download has to say what the screen says.
 *
 * It shipped not doing that. Every heading and figure was chosen freshly in
 * `export.ts` instead of read from the same `copy` the tabs render, and all
 * five tabs drifted — most seriously on Money, where a row headed "Money
 * earned" carried the *uncompleted* total while the tile headed "Money
 * earned" showed the completed one. One label, two numbers, which is the
 * defect this whole epic kept finding on screen, reintroduced in the file.
 *
 * These tests are written against the specific drifts rather than as a
 * general "matches the screen" assertion, because the general version needs
 * a rendered page and this harness has no browser.
 */

const metric = (value: number) => ({ value, previous: null, deltaPct: null });
const range = {
  key: 'this_month' as const,
  label: 'This month',
  startISO: '2026-08-01T00:00:00.000Z',
  endExclusiveISO: '2026-09-01T00:00:00.000Z',
  bucketUnit: 'day' as const,
  buckets: [],
};

/** Deliberately different, so a row carrying the wrong one is visible. */
const TOTAL_INCLUDING_UNFINISHED = 2_593_443_00;
const COMPLETED_ONLY = 2_492_693_00;

const revenue = {
  tab: 'revenue',
  data: {
    range,
    compare: false,
    kpis: {
      totalRevenueMinor: metric(TOTAL_INCLUDING_UNFINISHED),
      completedRevenueMinor: metric(COMPLETED_ONLY),
      avgBookingValueMinor: metric(198_779),
      revenuePerCustomerMinor: metric(243_665),
    },
    trend: [],
    byService: [],
    byProvider: [],
    showProviders: true,
    bySegment: [],
    byPaymentMethod: [],
  },
} as unknown as TabPayload;

const bookings = {
  tab: 'bookings',
  data: {
    range,
    compare: false,
    kpis: {
      total: metric(1287),
      completed: metric(1254),
      cancelled: metric(119),
      noShow: metric(97),
      upcoming: metric(1),
    },
    trend: [],
    byStatus: [],
    bySource: [],
    peakPeriods: { days: [], hours: [], grid: [], outsideOpeningHoursMinutes: 0 },
  },
} as unknown as TabPayload;

const serviceRow = {
  id: 's1',
  name: 'Bridal Package',
  bookings: 9,
  revenueMinor: 189_000,
  avgPriceMinor: 21_000,
  durationMin: 240,
  repeatPct: 22,
  distinctCustomers: 9,
  cancelPct: 4,
  retired: false,
};

const servicesWith = (rows: (typeof serviceRow)[]) =>
  ({ tab: 'services', data: { range, mostBooked: [], topRevenue: [], rows } }) as unknown as TabPayload;

const services = servicesWith([serviceRow]);

const staffRow = {
  id: 'p1',
  name: 'Priya',
  bookings: 92,
  completed: 89,
  revenueMinor: 260_787,
  avgValueMinor: 2_930,
  utilisationPct: 71 as number | null,
  noShowPct: 4,
  retired: false,
};

const staffWith = (rows: (typeof staffRow)[]) =>
  ({ tab: 'staff', data: { range, byRevenue: [], byUtilisation: [], rows } }) as unknown as TabPayload;

const staff = staffWith([staffRow]);

/** The row a heading introduces, as the file actually lays it out. */
function rowFor(csv: string, heading: string): string[] | null {
  const line = csv.split('\n').find((l) => l.startsWith(`${heading},`));
  return line ? line.split(',') : null;
}

describe('the download says what the screen says', () => {
  it('gives "Money earned" the figure the Money tile shows, not the uncompleted total', () => {
    const csv = reportToCsv(revenue, 'Staff');
    const row = rowFor(csv, copy.reports.money.earned);

    expect(row, 'no row headed with the tile the tab renders').not.toBeNull();
    expect(row![1]).toBe('2492693.00');
    // The regression, stated as itself: the total including bookings that have
    // not happened must not appear under a heading that means money taken.
    expect(csv).not.toContain('2593443');
  });

  it('lists the three Money tiles and nothing the tab does not show', () => {
    const csv = reportToCsv(revenue, 'Staff');
    const t = copy.reports.money;

    for (const label of [t.earned, t.perVisit, t.perClient]) expect(rowFor(csv, label)).not.toBeNull();
    // The tab has no fourth tile, so the file has no fourth row.
    expect(csv).not.toMatch(/From finished visits/);
  });

  it('lists the four Bookings tiles, and not the Finished one the tab dropped', () => {
    const csv = reportToCsv(bookings, 'Staff');

    expect(rowFor(csv, copy.reports.bookingsTab.total)?.[1]).toBe('1287');
    expect(rowFor(csv, copy.status.didNotCome)?.[1]).toBe('97');
    expect(rowFor(csv, copy.status.cancelled)?.[1]).toBe('119');
    expect(rowFor(csv, copy.reports.bookingsTab.upcoming)?.[1]).toBe('1');
    // "Finished" is the biggest slice of the chart below the tiles; a tile for
    // it repeated that chart's headline, which is why the tab has none.
    expect(csv).not.toMatch(/^Finished,/m);
  });

  it('uses the app’s word for a called-off booking, not its own', () => {
    const csv = reportToCsv(bookings, 'Staff');
    expect(csv).toContain(copy.status.cancelled);
    expect(csv).not.toContain('Called off,119');
  });

  it('heads the Services columns exactly as the Services table does', () => {
    const csv = reportToCsv(services, 'Staff');
    const t = copy.reports.servicesTab;
    const expected = [t.colService, t.colBookings, t.colRevenue, t.colAvg, t.colMinutes, t.colRepeat, t.colCancel];

    expect(csv.split('\n').some((l) => l === expected.join(','))).toBe(true);
  });

  it('heads the Staff columns exactly as the Staff table does, in the same order', () => {
    const csv = reportToCsv(staff, 'Staff');
    const t = copy.reports.staffTab;
    const expected = [t.colName, t.colBookings, t.colCompleted, t.colRevenue, t.colAvg, t.colUtilisation, t.colNoShow];

    expect(csv.split('\n').some((l) => l === expected.join(','))).toBe(true);
  });

  it('writes money a spreadsheet can add up', () => {
    const csv = reportToCsv(revenue, 'Staff');
    // No symbol, no grouping — "₹24,92,693" is a string to Excel, and one
    // that splits across two CSV columns at the comma.
    expect(csv).not.toContain('₹');
    expect(rowFor(csv, copy.reports.money.earned)![1]).toMatch(/^\d+\.\d{2}$/);
  });

  it('leaves utilisation blank rather than zero when it has been suppressed', () => {
    const suppressed = staffWith([{ ...staffRow, utilisationPct: null }]);

    const row = reportToCsv(suppressed, 'Staff').split('\n').find((l) => l.startsWith('Priya,'));
    // A whole denominator under a cut numerator would read as a slump that
    // never happened, so there is no figure to write — and 0 is a figure.
    expect(row!.split(',')[5]).toBe('');
  });

  it('names the tenant, the tab and the range in the filename', () => {
    expect(csvFilename('Glow Salon', 'revenue', 'This month')).toBe('glow-salon-revenue-this-month.csv');
    // A tenant whose name is all punctuation still produces a usable name.
    expect(csvFilename('!!!', 'revenue', 'This month')).toBe('report-revenue-this-month.csv');
  });

  it('quotes a value containing a comma rather than splitting the row', () => {
    const commaName = servicesWith([{ ...serviceRow, name: 'Cut, Colour & Blow-dry' }]);

    const line = reportToCsv(commaName, 'Staff').split('\n').find((l) => l.includes('Cut'))!;
    expect(line.startsWith('"Cut, Colour & Blow-dry",')).toBe(true);
  });
});
