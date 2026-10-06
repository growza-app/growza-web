import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ProviderDetail, ProviderOverviewRow, Service } from '../lib/api';
import { LabelsProvider } from '../components/LabelsProvider';
import { StaffEditClient } from './[id]/StaffEditClient';
import { StaffGroup, type RosterActions } from './StaffRoster';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), useSearchParams: () => new URLSearchParams() }));

/** Jira GRW-357 — the staff screens render in both languages, from real components. */
const wrap = (locale: 'en' | 'hi', child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(LabelsProvider, { labels: {}, children: child }),
    }),
  );

const detail = {
  id: 'p1',
  displayName: 'Priya Sharma',
  title: 'Stylist',
  phone: '+919876543210',
  locationId: null,
  active: true,
  unavailableToday: false,
  serviceIds: ['s1'],
  workingHours: [],
  usesOrgHours: true,
  seesOwnRevenue: false,
} as unknown as ProviderDetail;
const services = [{ id: 's1', name: 'Haircut' }] as unknown as Service[];

const edit = (locale: 'en' | 'hi') =>
  wrap(
    locale,
    createElement(StaffEditClient, { detail, services, day: null, stats: null, staffWord: 'Staff', orgWorkingHours: [], branches: [] }),
  );

describe('the staff edit screen', () => {
  it('keeps the English words', () => {
    const html = edit('en');
    for (const s of ['Details', 'Full name', 'Earnings', 'Show their own earnings', 'Working hours', 'Same as the business', 'Services this person can take', 'Last 30 days', 'Danger zone', 'Mark inactive', 'Save changes']) {
      expect(html, s).toContain(s);
    }
    expect(html).toContain('1 of 1 selected');
  });

  it('reads in Hindi with no English chrome left', () => {
    const html = edit('hi');
    for (const s of ['जानकारी', 'पूरा नाम', 'कमाई', 'काम के घंटे', 'बिज़नेस के जैसे', 'पिछले 30 दिन', 'बंद करें', 'बदलाव सेव करें']) expect(html, s).toContain(s);
    expect(html).toContain('1 में से 1 चुनी गईं');
    for (const s of ['Details', 'Earnings', 'Danger zone', 'Last 30 days', 'Save changes', 'Cancel']) expect(html, s).not.toContain(s);
  });
});

const row = {
  id: 'p1',
  displayName: 'Priya Sharma',
  title: 'Stylist',
  active: true,
  unavailableToday: false,
  hasWorkingHours: true,
  workingHoursTodayStart: '09:00:00',
  workingHoursTodayEnd: '18:00:00',
  todayBookings: 0,
  todayBookedSegments: [],
  nextWorkingDay: null,
  branchLabel: null,
} as unknown as ProviderOverviewRow;
const off = { ...row, id: 'p2', displayName: 'Anil', workingHoursTodayStart: null, workingHoursTodayEnd: null, nextWorkingDay: { dayOffset: 2, weekday: 5, startTime: '09:00:00' } } as unknown as ProviderOverviewRow;
const actions: RosterActions = { onToggleAvailable: () => {}, onEdit: () => {}, onSetActive: () => {}, busyId: null };

describe('the staff roster', () => {
  const group = (locale: 'en' | 'hi') =>
    wrap(
      locale,
      createElement(StaffGroup, { title: 'x', tone: 'off', people: [row], off: false, topPerformerId: 'p1', actions, onOpenSheet: () => {} }),
    );

  it('says who is back, in the language', () => {
    expect(group('en')).toContain('Free all day');
    expect(group('hi')).toContain('दिन भर खाली');
    // Anil is off the whole time: "Back Friday, 9:00 AM" / the Hindi weekday
    const offOnly = (locale: 'en' | 'hi') => wrap(locale, createElement(StaffGroup, { title: 'x', tone: 'off', people: [off], off: true, topPerformerId: null, actions, onOpenSheet: () => {} }));
    expect(offOnly('en')).toContain('Back Friday, 9:00 AM');
    expect(offOnly('hi')).toContain('शुक्रवार, 9:00 AM पर वापस');
  });
});
