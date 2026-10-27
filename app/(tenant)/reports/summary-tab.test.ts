import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ReportStaff } from '../lib/api';
import { LabelsProvider } from '../components/LabelsProvider';
import { ReportsClient } from './ReportsClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams('tab=staff&range=this_month&branch=b1&providerId=p1'),
  usePathname: () => '/reports',
}));

/**
 * Owner, 2026-10-27 — the way back to the four cards.
 *
 * `/reports` with no `tab` is the summary page, and until this test nothing linked to it: the header's
 * Back arrow steps through history, so from the third tab you visit it walks the tabs rather than leaving
 * them. The tab bar now carries the way out, and it is absent for a viewer whose `/reports` is a tab
 * anyway — a button that lands you where you already are is worse than no button.
 */
const SALON = { provider: 'Stylist', providers: 'Staff', customers: 'Clients' };

const staff = {
  range: {
    key: 'this_month',
    label: 'This month',
    startISO: '2026-09-01T00:00:00.000Z',
    endExclusiveISO: '2026-10-01T00:00:00.000Z',
    bucketUnit: 'day',
    buckets: [],
  },
  utilisationSuppressed: false,
  byRevenue: [{ label: 'Priya', value: 600000, retired: false }],
  byUtilisation: [{ label: 'Priya', value: 70, retired: false }],
  rows: [
    { id: 'p1', name: 'Priya', bookings: 10, completed: 9, revenueMinor: 600000, avgValueMinor: 66667, utilisationPct: 70, noShowPct: 0, retired: false },
  ],
} as unknown as ReportStaff;

const page = (locale: 'en' | 'hi', hasSummary: boolean) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(LabelsProvider, {
        labels: SALON,
        children: createElement(ReportsClient, {
          tab: 'staff',
          range: 'this_month',
          compare: false,
          staffTabAvailable: true,
          hasSummary,
          allowedTabs: ['overview', 'customers', 'revenue', 'bookings', 'services', 'staff'],
          filters: { providerIds: [], serviceIds: [], statuses: [] },
          filterOptions: { providers: [], services: [] },
          droppedFilters: 0,
          providerLabel: 'Staff',
          tenantName: 'Glow Salon',
          rangeLabel: 'This month',
          labels: SALON,
          payload: { tab: 'staff', data: staff },
        }),
      }),
    }),
  );

describe('the way back to the four cards', () => {
  it('is the first thing on the tab bar, before the tabs themselves', () => {
    const html = page('en', true);
    expect(html).toContain('rp-tab-summary');
    expect(html.indexOf('rp-tab-summary')).toBeLessThan(html.indexOf('>Overview<'));
    expect(html).toContain(`>${en.reports.summaryTab}<`);
  });

  it('is worded in Hindi, with no English left on it', () => {
    const html = page('hi', true);
    expect(html).toContain(`>${hi.reports.summaryTab}<`);
    expect(html).not.toContain('>Summary<');
  });

  it('is absent for a viewer whose /reports is a tab rather than the cards', () => {
    expect(page('en', false)).not.toContain('rp-tab-summary');
  });
});
