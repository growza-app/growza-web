import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ReportStaff } from '../lib/api';
import { LabelsProvider } from '../components/LabelsProvider';
import { StaffToday } from '../components/home/DaySummarySheet';
import { homeCopy } from '../lib/home-copy';
import { useNoProvider } from '../lib/use-no-provider';
import { ReportsClient } from './ReportsClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reports',
}));

/**
 * Jira GRW-363 · review of #194 — the row for visits recorded with no stylist, and the nouns around
 * it, wherever they appear: Record payment's choice, Home's day summary, the Reports page.
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

const range = {
  key: 'this_month' as const,
  label: 'This month',
  startISO: '2026-09-01T00:00:00.000Z',
  endExclusiveISO: '2026-10-01T00:00:00.000Z',
  bucketUnit: 'day' as const,
  buckets: [],
};

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

/**
 * Review of #194 — one meaning, one word. The Record payment choice, Home's day summary row and the
 * Reports row are the same phrase from `common.noProvider`, and in Hindi it is built from
 * `nouns.staff` — one spelling, स्टाफ़, where there were three.
 */
describe('the no-stylist phrase, wherever it appears', () => {
  const Probe = () => createElement('p', null, useNoProvider());
  const said = (locale: 'en' | 'hi', labels: Record<string, string>) =>
    renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale,
        messages: locale === 'en' ? en : hi,
        timeZone: 'Asia/Kolkata',
        children: createElement(LabelsProvider, { labels, children: createElement(Probe) }),
      }),
    ).replace(/<\/?p>/g, '');

  it('names the vertical’s noun in English, keeping a label that is not plain Title case', () => {
    expect(said('en', { provider: 'Stylist' })).toBe('No stylist');
    expect(said('en', { provider: 'Doctor' })).toBe('No doctor');
    expect(said('en', { provider: 'MUA' })).toBe('No MUA');
    expect(said('en', { provider: 'Hair Stylist' })).toBe('No Hair Stylist');
  });

  it('is built from nouns.staff in Hindi, whatever the vertical', () => {
    const phrase = `कोई ${hi.nouns.staff} नहीं`;
    expect(phrase).toBe('कोई स्टाफ़ नहीं');
    expect(said('hi', { provider: 'Stylist' })).toBe(phrase);
    expect(said('hi', { provider: 'Doctor' })).toBe(phrase);
  });

  it('no message file keeps a second wording of it', () => {
    for (const messages of [en, hi]) {
      expect(JSON.stringify(messages)).not.toMatch(/"noStylist"|"unassigned"/);
    }
    expect(JSON.stringify(hi)).not.toMatch(/स्टाफ(?!़)/);
    expect(JSON.stringify(hi)).not.toContain('कोई स्टाइलिस्ट नहीं');
    for (const lang of ['en', 'hi'] as const) {
      const words = JSON.stringify(homeCopy(lang, { provider: 'Stylist' }));
      expect(words).not.toMatch(/स्टाफ(?!़)/);
    }
  });
});

describe('Home’s day summary: who worked today', () => {
  const staffToday = [
    { id: 'p1', name: 'Priya', bookings: 2, revenueMinor: 30000 },
    { id: '', name: 'Unassigned', bookings: 2, revenueMinor: 300000, key: 'unassigned' as const },
  ];
  const html = (locale: 'en' | 'hi', labels: Record<string, string>) =>
    renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale,
        messages: locale === 'en' ? en : hi,
        timeZone: 'Asia/Kolkata',
        children: createElement(LabelsProvider, {
          labels,
          children: createElement(StaffToday, { t: homeCopy(locale, labels), staff: staffToday }),
        }),
      }),
    );

  it('names the no-stylist row with the salon’s noun, and a dash for its avatar', () => {
    const page = html('en', SALON);
    expect(page).toContain('>No stylist<');
    expect(page).toContain('>—<');
    expect(page).not.toContain('Unassigned');
    expect(page).not.toContain('>NS<');
    // A person keeps their initials and their name.
    expect(page).toContain('>Priya<');
    expect(page).toContain('>P<');
  });

  it('says doctor for a clinic', () => {
    expect(html('en', { provider: 'Doctor', appointment: 'Visit', appointments: 'Visits' })).toContain('>No doctor<');
  });

  it('reads in Hindi, heading and row in one spelling', () => {
    const page = html('hi', SALON);
    expect(page).toContain('>कोई स्टाफ़ नहीं<');
    expect(page).toContain('आज का स्टाफ़');
    expect(page).not.toContain('>कस<');
    for (const s of ['Unassigned', 'No stylist', 'Staff today']) expect(page, s).not.toContain(s);
  });
});

/**
 * Review of #194 — the tab names and the provider word are derived on screen (pickNoun), not
 * handed to a tab already translated. The page gets the vertical's English, as it does in the app.
 */
describe('the Reports page in Hindi names the staff and clients itself', () => {
  const page = (locale: 'en' | 'hi') =>
    wrap(
      locale,
      createElement(ReportsClient, {
        tab: 'staff',
        range: 'this_month',
        compare: false,
        staffTabAvailable: true,
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
    );

  it('in English: the vertical’s nouns on the tab bar and the table', () => {
    const html = page('en');
    expect(html).toContain('>Clients<');
    expect(html).toContain('>Staff<');
    expect(html).toContain('Staff side by side');
    expect(html).toContain('No stylist');
  });

  it('in Hindi: the generic words, with no English noun left', () => {
    const html = page('hi');
    expect(html).toContain(`>${hi.reports.tabs.customers}<`);
    expect(html).toContain(`>${hi.reports.tabs.staff}<`);
    expect(html).toContain('स्टाफ़ आमने-सामने');
    expect(html).toContain('कोई स्टाफ़ नहीं');
    expect(html).toContain('Priya');
    for (const s of ['>Clients<', '>Staff<', 'Staff side by side', 'stylist', 'Unassigned']) expect(html, s).not.toContain(s);
  });
});
