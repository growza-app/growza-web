import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ReportBookings, ReportCustomers, ReportRevenue, ReportServices, ReportStaff } from '../lib/api';
import { BookingsTab } from './BookingsTab';
import { CustomersTab } from './CustomersTab';
import { RevenueTab } from './RevenueTab';
import { ServicesTab } from './ServicesTab';
import { StaffTab } from './StaffTab';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reports',
}));

/**
 * Jira GRW-568 — the seven signals read in both languages, and each block is
 * absent (not broken) on an API that predates it.
 */
const wrap = (locale: 'en' | 'hi', child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'Asia/Kolkata', children: child }),
  );

const metric = (value: number) => ({ value, previous: null, deltaPct: null });
const range = {
  key: 'this_month', label: 'This month', startISO: '2026-09-01T00:00:00+05:30', endExclusiveISO: '2026-09-11T00:00:00+05:30',
  bucketUnit: 'day', buckets: [{ label: '1 Sep', startISO: '2026-09-01T00:00:00+05:30', endExclusiveISO: '2026-09-02T00:00:00+05:30' }],
};
const grid = { days: ['Mon'], dayNumbers: [1], hourNumbers: [9], hours: ['9am'], grid: [[1]], basis: 'booking_count', outsideOpeningHoursMinutes: 0 };

const revenue = {
  range, compare: false,
  kpis: { totalRevenueMinor: metric(1), completedRevenueMinor: metric(1), avgBookingValueMinor: metric(1), revenuePerCustomerMinor: metric(1) },
  trend: [{ label: '1 Sep', value: 1 }], byService: [], byProvider: [], showProviders: false, bySegment: [], byPaymentMethod: [],
  offers: [{ id: 'o1', title: 'Cut and colour', bookings: 3, revenueMinor: 240000, discountMinor: 60000, retired: false }],
} as unknown as ReportRevenue;

const bookings = {
  range, compare: false,
  kpis: { total: metric(3), completed: metric(1), cancelled: metric(1), noShow: metric(0) },
  trend: [{ label: '1 Sep', value: 1 }], byStatus: [], bySource: [{ label: 'WhatsApp', value: 1, key: 'whatsapp' }], peakPeriods: grid,
  sources: { whatsapp: 1, bookedAhead: 1, walkIn: 1 },
  endings: { moved: 1, cancelledByCustomer: 1, cancelledBySalon: 0, cancelledOther: 0 },
  tokens: { issued: 3, waiting: 1, served: 2, paid: 1, left: 0, cancelled: 0, avgWaitMin: 15 },
} as unknown as ReportBookings;

const services = {
  range, mostBooked: [], topRevenue: [], rows: [],
  byCategory: [{ label: 'Hair', value: 88000 }, { label: 'Other', value: 32000, key: 'other' }],
} as unknown as ReportServices;

const staff = {
  range, byRevenue: [], byUtilisation: [],
  rows: [{ id: 'p1', name: 'Priya', bookings: 2, completed: 2, revenueMinor: 90000, avgValueMinor: 45000, utilisationPct: 50, noShowPct: 0, discountMinor: 10000, retired: false }],
} as unknown as ReportStaff;

const customers = {
  range, compare: false,
  kpis: { total: metric(3), newCustomers: metric(1), avgSpendMinor: metric(1), overdue: metric(0) },
  segments: [], neverVisited: 0, opportunities: [], spend: [], frequency: [], avgIntervalDays: null, avgVisits: 1, topCustomers: [], repeatRatePct: metric(0),
  reach: { reachable: 1, noPhone: 1, optedOut: 1 },
} as unknown as ReportCustomers;

describe('the seven signals', () => {
  it('Money: each offer with what it earned and what it cost', () => {
    const html = wrap('en', createElement(RevenueTab, { data: revenue }));
    for (const s of ['Your offers', 'Cut and colour', '₹2,400', '₹600', 'Discount given']) expect(html, s).toContain(s);
    expect(wrap('hi', createElement(RevenueTab, { data: revenue }))).toContain('दी गई छूट');
  });

  it('Bookings: three sources, what was moved or called off, and the wait', () => {
    const html = wrap('en', createElement(BookingsTab, { data: bookings }));
    for (const s of ['Booked ahead at the desk', 'Walked in', 'Moved to another time', 'Called off by the client', 'Walk-ins waited 15 minutes on average']) {
      expect(html, s).toContain(s);
    }
    expect(html).not.toContain('Called off by you');
    const hindi = wrap('hi', createElement(BookingsTab, { data: bookings }));
    for (const s of ['काउंटर पर पहले से बुक', 'दूसरे समय पर बदला', '15 मिनट']) expect(hindi, s).toContain(s);
  });

  it('Services: money by category, Other in the owner’s language', () => {
    expect(wrap('en', createElement(ServicesTab, { data: services }))).toContain('Money by category');
    const hindi = wrap('hi', createElement(ServicesTab, { data: services }));
    expect(hindi).toContain('श्रेणी के हिसाब से पैसा');
    expect(hindi).toContain('Hair');
    expect(hindi).not.toContain('>Other<');
  });

  it('Staff: a Discounts column', () => {
    const html = wrap('en', createElement(StaffTab, { data: staff, providerLabel: 'Stylists' }));
    expect(html).toContain('Discounts');
    expect(html).toContain('₹100');
  });

  it('Clients: who an offer can reach', () => {
    const html = wrap('en', createElement(CustomersTab, { data: customers, status: 'all' }));
    expect(html).toContain('1 client can get an offer on WhatsApp.');
    expect(html).toContain('1 has no number.');
    expect(html).toContain('1 asked not to be messaged.');
  });

  it('an older API: every block is absent, nothing breaks', () => {
    const strip = <T extends object>(o: T, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;
    expect(wrap('en', createElement(RevenueTab, { data: strip(revenue, ['offers']) }))).not.toContain('Your offers');
    const old = wrap('en', createElement(BookingsTab, { data: { ...strip(bookings, ['sources', 'endings']), tokens: { issued: 1, served: 1, paid: 1, left: 0, cancelled: 0 } } as ReportBookings }));
    expect(old).not.toContain('Moved or called off');
    expect(old).not.toContain('waited');
    expect(old).toContain('WhatsApp');
    expect(wrap('en', createElement(StaffTab, { data: { ...staff, rows: [{ ...staff.rows[0]!, discountMinor: undefined }] } as ReportStaff, providerLabel: 'Stylists' }))).not.toContain('Discounts');
    expect(wrap('en', createElement(CustomersTab, { data: strip(customers, ['reach']), status: 'all' }))).not.toContain('can get an offer');
  });
});
