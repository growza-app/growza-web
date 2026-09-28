import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { REPORT_ROW_KEYS } from '@growza-app/shared';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ReportBookings, ReportCustomers, ReportOverview, ReportRevenue, ReportStaff } from '../lib/api';
import { LabelsProvider } from '../components/LabelsProvider';
import { useReportsCopy } from '../lib/use-reports-copy';
import { copy } from '../lib/copy';
import { reportToCsv } from './export';
import { BookingsTab } from './BookingsTab';
import { CustomersTab } from './CustomersTab';
import { OverviewTab } from './OverviewTab';
import { RevenueTab } from './RevenueTab';
import { StaffTab } from './StaffTab';
import { useRowName } from './use-row-name';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reports',
}));

/**
 * Jira GRW-363 — the rows the API names itself ("Came back", "Cash", "Everything else",
 * "Unassigned", "Just once", "Walk-in", "Mon") read in the owner's language.
 *
 * The API sends a code beside the English; these render the real tabs from a payload shaped
 * like the API's, in both languages, with a salon's labels in place.
 */
const SALON = { provider: 'Stylist', providers: 'Staff', customers: 'Clients' };

const wrap = (locale: 'en' | 'hi', child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(LabelsProvider, { labels: SALON, children: child }),
    }),
  );

const metric = (value: number) => ({ value, previous: null, deltaPct: null });
const range = {
  key: 'this_month' as const,
  label: 'This month',
  startISO: '2026-09-01T00:00:00.000Z',
  endExclusiveISO: '2026-10-01T00:00:00.000Z',
  bucketUnit: 'day' as const,
  buckets: [
    { label: '1 Sep', startISO: '2026-09-01T00:00:00.000Z', endExclusiveISO: '2026-09-02T00:00:00.000Z' },
    { label: '2 Sep', startISO: '2026-09-02T00:00:00.000Z', endExclusiveISO: '2026-09-03T00:00:00.000Z' },
  ],
};

const revenue = {
  range,
  compare: false,
  kpis: {
    totalRevenueMinor: metric(900000),
    completedRevenueMinor: metric(800000),
    avgBookingValueMinor: metric(40000),
    revenuePerCustomerMinor: metric(50000),
  },
  trend: [{ label: '1 Sep', value: 400000 }, { label: '2 Sep', value: 400000 }],
  byService: [
    { label: 'Haircut', value: 500000, retired: false },
    { label: 'Everything else', value: 300000, key: 'everything_else' },
  ],
  byProvider: [
    { label: 'Priya', value: 600000, retired: false },
    { label: 'Unassigned', value: 200000, retired: false, key: 'unassigned' },
  ],
  showProviders: true,
  bySegment: [
    { label: 'Came back', value: 400000, key: 'returning' },
    { label: 'First visit', value: 300000, key: 'new' },
    { label: 'One-off', value: 100000, key: 'one_off' },
  ],
  byPaymentMethod: [
    { label: 'UPI', value: 300000, key: 'upi' },
    { label: 'Cash', value: 200000, key: 'cash' },
    { label: 'Card', value: 100000, key: 'card' },
    { label: 'Other', value: 100000, key: 'other' },
    { label: 'Not recorded', value: 100000, key: 'not_recorded' },
  ],
} as unknown as ReportRevenue;

describe('the Money tab', () => {
  const html = (l: 'en' | 'hi') => wrap(l, createElement(RevenueTab, { data: revenue }));

  it('keeps the English words, and names the no-stylist row with the salon’s own noun', () => {
    const page = html('en');
    for (const s of ['Came back', 'First visit', 'One-off', 'UPI', 'Cash', 'Card', 'Other', 'Not recorded', 'Everything else', 'No stylist', 'Haircut', 'Priya']) {
      expect(page, s).toContain(s);
    }
    // The "Not recorded" footnote still finds its slice, now by code.
    expect(page).toContain(en.reports.money.notRecordedHint.replace(/"/g, '&quot;'));
  });

  it('reads in Hindi, with the owner’s own names as typed', () => {
    const page = html('hi');
    for (const s of ['लौटकर आए', 'पहली बार आए', 'सिर्फ़ एक बार आए', 'UPI', 'नकद', 'कार्ड', 'दूसरा', 'दर्ज नहीं', 'बाकी सब', 'कोई स्टाफ़ नहीं', 'Haircut', 'Priya']) {
      expect(page, s).toContain(s);
    }
    for (const s of ['Came back', 'First visit', 'One-off', 'Cash', 'Card', 'Other', 'Not recorded', 'Everything else', 'Unassigned', 'stylist']) {
      expect(page, s).not.toContain(s);
    }
    expect(page).toContain(hi.reports.money.notRecordedHint);
  });

  it('writes the file in English whatever the screen says (a file is not translated per viewer)', () => {
    const csv = reportToCsv({ tab: 'revenue', data: revenue }, 'Staff', 'Stylist');
    // The no-stylist row has the screen's English name, not the API's "Unassigned" (decision to confirm).
    for (const s of ['Came back,4000.00', 'Not recorded,1000.00', 'Everything else,3000.00', 'No stylist,2000.00', 'Cash,2000.00']) {
      expect(csv, s).toContain(s);
    }
    expect(csv).not.toContain('Unassigned');
  });

  it('the file and the English screen name the no-stylist row with the same words', () => {
    expect(en.common.noProvider.replace('{provider}', 'stylist')).toBe(copy.reports.noProvider('stylist'));
    // An acronym keeps its capitals in the file, as on screen (review of #194).
    const mua = reportToCsv({ tab: 'revenue', data: revenue }, 'MUAs', 'MUA');
    expect(mua).toContain('No MUA,2000.00');
  });
});

const bookings = {
  range,
  compare: false,
  kpis: { total: metric(8), completed: metric(6), cancelled: metric(1), noShow: metric(1) },
  trend: [{ label: '1 Sep', value: 4 }, { label: '2 Sep', value: 4 }],
  byStatus: [{ label: 'completed', value: 6 }],
  bySource: [
    { label: 'WhatsApp', value: 5, key: 'whatsapp' },
    { label: 'Walk-in', value: 3, key: 'walk_in' },
  ],
  peakPeriods: {
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    dayNumbers: [1, 2, 3, 4, 5, 6, 0],
    hours: ['9', '10'],
    grid: [[0.5, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
    basis: 'booked_minutes',
    outsideOpeningHoursMinutes: 90,
  },
} as unknown as ReportBookings;

describe('the Bookings tab', () => {
  const html = (l: 'en' | 'hi') => wrap(l, createElement(BookingsTab, { data: bookings }));

  it('keeps the English words', () => {
    const page = html('en');
    for (const s of ['WhatsApp', 'Walk-in', '>Mon<', '>Sun<', 'Mon 9 · 50% of your busiest hour', '1h 30m booked outside your opening hours.']) {
      expect(page, s).toContain(s);
    }
  });

  it('reads in Hindi: the source, the weekdays, the cell and the hours outside', () => {
    const page = html('hi');
    for (const s of ['WhatsApp', 'वॉक-इन', '>सोम<', '>रवि<', 'सोम 9 · सबसे व्यस्त घंटे का 50%', '1 घंटा 30 मिनट आपके खुलने के घंटों के बाहर बुक हैं।']) {
      expect(page, s).toContain(s);
    }
    for (const s of ['Walk-in', '>Mon<', '>Sun<', 'busiest hour', '1h 30m']) expect(page, s).not.toContain(s);
  });

  it('still names the rows from the API’s English when it predates the weekday numbers', () => {
    const older = { ...bookings, peakPeriods: { ...bookings.peakPeriods, dayNumbers: undefined } } as ReportBookings;
    expect(wrap('hi', createElement(BookingsTab, { data: older }))).toContain('>Mon<');
  });
});

const customers = {
  range,
  compare: false,
  kpis: { total: metric(40), newCustomers: metric(4), avgSpendMinor: metric(50000), overdue: metric(3) },
  segments: [
    { key: 'active', rangeLabel: '0–30 days', count: 20 },
    { key: 'due', rangeLabel: '31–45 days', count: 10 },
    { key: 'at_risk', rangeLabel: '46–90 days', count: 5 },
    { key: 'inactive', rangeLabel: '90+ days', count: 5 },
  ],
  neverVisited: 0,
  opportunities: [],
  spend: [
    { label: '₹10,000+', value: 2, key: 'spend_10k_plus' },
    { label: 'Under ₹1,000', value: 30, key: 'spend_under_1k' },
  ],
  frequency: [
    { label: '10+ visits', value: 1, key: 'visits_10_plus' },
    { label: '2–4 visits', value: 10, key: 'visits_2_to_4' },
    { label: 'Just once', value: 20, key: 'visits_once' },
    { label: 'Never been in', value: 9, key: 'visits_never' },
  ],
  avgIntervalDays: 21,
  avgVisits: 2.5,
  topCustomers: [
    { id: 'c1', name: 'Asha', initial: 'A', visits: 4, lifetimeSpendMinor: 200000, avgSpendMinor: 50000, lastVisitDays: 3, favouriteService: 'Haircut', intervalDays: 21 },
  ],
  repeatRatePct: metric(40),
} as unknown as ReportCustomers;

describe('the Clients tab', () => {
  const html = (l: 'en' | 'hi') =>
    wrap(l, createElement(CustomersTab, { data: customers, status: 'all', onSegment: () => {}, onClient: () => {} }));

  it('keeps the English words', () => {
    const page = html('en');
    for (const s of ['₹10,000+', 'Under ₹1,000', '10+ visits', '2–4 visits', 'Just once', 'Never been in', '~21d', '· 0–30 days']) {
      expect(page, s).toContain(s);
    }
  });

  it('reads in Hindi', () => {
    const page = html('hi');
    for (const s of ['₹10,000+', '₹1,000 से कम', '10+ विज़िट', '2–4 विज़िट', 'बस एक बार', 'कभी नहीं आए', '~21 दिन', '· 0–30 दिन']) {
      expect(page, s).toContain(s);
    }
    for (const s of ['Under ₹1,000', 'visits', 'Just once', 'Never been in', '~21d', 'days']) expect(page, s).not.toContain(s);
  });
});

const staff = {
  range,
  utilisationSuppressed: false,
  byRevenue: [
    { label: 'Priya', value: 600000, retired: false },
    { label: 'Unassigned', value: 200000, retired: false, key: 'unassigned' },
  ],
  byUtilisation: [{ label: 'Priya', value: 70, retired: false }],
  rows: [
    { id: 'p1', name: 'Priya', bookings: 10, completed: 9, revenueMinor: 600000, avgValueMinor: 66667, utilisationPct: 70, noShowPct: 0, retired: false },
    { id: '', name: 'Unassigned', bookings: 3, completed: 3, revenueMinor: 200000, avgValueMinor: 66667, utilisationPct: null, noShowPct: 0, retired: false, key: 'unassigned' },
  ],
} as unknown as ReportStaff;

describe('the Staff tab', () => {
  const html = (l: 'en' | 'hi', providerLabel: string) => wrap(l, createElement(StaffTab, { data: staff, providerLabel }));

  it('names the no-stylist row with the salon’s own noun in English, and a dash for its avatar', () => {
    const page = html('en', 'Staff');
    expect(page).toContain('No stylist');
    expect(page).not.toContain('Unassigned');
    expect(page).toContain('Staff side by side');
    expect(page).toContain('<span class="rp-avatar is-nobody">—</span>');
    expect(page).not.toContain('>N</span>');
    expect(page).toContain('<span class="rp-avatar">P</span>');
  });

  it('a clinic’s English says doctor, not stylist', () => {
    const page = renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale: 'en',
        messages: en,
        timeZone: 'Asia/Kolkata',
        children: createElement(LabelsProvider, { labels: { provider: 'Doctor' }, children: createElement(StaffTab, { data: staff, providerLabel: 'Doctors' }) }),
      }),
    );
    expect(page).toContain('No doctor');
  });
});

const overview = {
  range,
  compare: false,
  kpis: {
    revenueMinor: metric(800000),
    bookings: metric(8),
    completed: metric(6),
    avgBookingValueMinor: metric(40000),
    newCustomers: metric(4),
    repeatRatePct: metric(40),
  },
  revenueTrend: [{ label: '1 Sep', value: 400000 }, { label: '2 Sep', value: 400000 }],
  bookingTrend: [{ label: '1 Sep', value: 4 }, { label: '2 Sep', value: 4 }],
  sparklines: {
    revenueMinor: [{ label: '1 Sep', value: 1 }, { label: '2 Sep', value: 2 }],
    bookings: [{ label: '1 Sep', value: 1 }, { label: '2 Sep', value: 2 }],
    completed: [{ label: '1 Sep', value: 1 }, { label: '2 Sep', value: 2 }],
    avgBookingValueMinor: [{ label: '1 Sep', value: 1 }, { label: '2 Sep', value: 2 }],
    newCustomers: [{ label: '1 Sep', value: 1 }, { label: '2 Sep', value: 2 }],
    repeatRatePct: [{ label: '1 Sep', value: 1 }, { label: '2 Sep', value: 2 }],
  },
  totalCustomers: 40,
  neverVisited: 0,
  segments: customers.segments,
  topServices: [{ label: 'Haircut', value: 500000 }],
  opportunities: [],
} as unknown as ReportOverview;

describe('the Overview tab', () => {
  const html = (l: 'en' | 'hi') => wrap(l, createElement(OverviewTab, { data: overview, onTab: () => {}, onClient: () => {} }));

  it('names the came-back line and the bands’ days in English', () => {
    const page = html('en');
    expect(page).toContain('aria-label="Came back, 1 Sep – 2 Sep"');
    expect(page).toContain('>0–30 days<');
  });

  it('and in Hindi', () => {
    const page = html('hi');
    expect(page).toContain('aria-label="लौटकर आए, 1 Sep – 2 Sep"');
    expect(page).toContain('>0–30 दिन<');
    for (const s of ['Came back', '0–30 days']) expect(page, s).not.toContain(s);
  });
});

describe('the counted words a chart names when you point at it', () => {
  const said = (locale: 'en' | 'hi') => {
    const Probe = () => {
      const rp = useReportsCopy();
      return createElement('p', null, [rp.bookingsCount(1), rp.bookingsCount(3), rp.duration(45), rp.duration(60), rp.duration(150)].join('|'));
    };
    return wrap(locale, createElement(Probe)).replace(/<\/?p>/g, '').split('|');
  };

  it('in English, with the singular right', () => {
    expect(said('en')).toEqual(['1 booking', '3 bookings', '45m', '1h', '2h 30m']);
  });

  it('in Hindi', () => {
    expect(said('hi')).toEqual(['1 बुकिंग', '3 बुकिंग', '45 मिनट', '1 घंटा', '2 घंटे 30 मिनट']);
  });
});

describe('what a count is of', () => {
  const counted = (locale: 'en' | 'hi', labels: Record<string, string>) => {
    const Probe = () => {
      const rp = useReportsCopy();
      return createElement('p', null, [rp.bookingsCount(1), rp.bookingsCount(5)].join('|'));
    };
    return renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale,
        messages: locale === 'en' ? en : hi,
        timeZone: 'Asia/Kolkata',
        children: createElement(LabelsProvider, { labels, children: createElement(Probe) }),
      }),
    ).replace(/<\/?p>/g, '').split('|');
  };

  it('is the vertical’s own noun in English, as Home counts them (review of #194)', () => {
    expect(counted('en', { appointment: 'Booking', appointments: 'Bookings' })).toEqual(['1 booking', '5 bookings']);
    expect(counted('en', { appointment: 'Visit', appointments: 'Visits' })).toEqual(['1 visit', '5 visits']);
  });

  it('is the generic word in Hindi, whatever the vertical', () => {
    expect(counted('hi', { appointment: 'Visit', appointments: 'Visits' })).toEqual(['1 बुकिंग', '5 बुकिंग']);
  });
});

describe('every code the API can send has words on this screen', () => {
  const named = (locale: 'en' | 'hi') => {
    const Probe = () => {
      const nameOf = useRowName();
      return createElement('p', null, REPORT_ROW_KEYS.map((key) => nameOf({ key, label: 'ENGLISH-FALLBACK' })).join('|'));
    };
    return wrap(locale, createElement(Probe)).replace(/<\/?p>/g, '').split('|');
  };

  it('in English and in Hindi — none falls back to the API’s label', () => {
    for (const locale of ['en', 'hi'] as const) {
      const words = named(locale);
      expect(words).toHaveLength(REPORT_ROW_KEYS.length);
      expect(words.filter((w) => w === 'ENGLISH-FALLBACK' || w === '')).toEqual([]);
    }
  });
});
