import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ReportTodo } from '../lib/api';
import { ShareWeek } from './ShareWeek';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reports',
}));

/** Jira GRW-569 — the week as a text: five sentences, two to-dos, no number on the link. */
type Data = ReportTodo;

const base: Data = {
  weekStartISO: '2026-10-07T00:00:00+05:30',
  weekEndExclusiveISO: '2026-10-14T00:00:00+05:30',
  monthLabel: 'This month',
  possible: 7,
  week: {
    vs: 'week',
    money: { value: 2273000, previous: 1309600 },
    visits: { value: 16, previous: 13 },
    newClients: { value: 3, previous: 8 },
    cameBack: { value: 3, previous: 3 },
    noShows: { value: 1, previous: 0 },
  },
  cards: [
    { kind: 'money', tone: 'good', revenueMinor: 2273000, previousMinor: 1309600, bookings: 16 },
    { kind: 'dueBack', tone: 'warn', count: 2, clients: [] },
    { kind: 'quietHours', tone: 'warn', weekday: 3, fromHour: 12, toHour: 13 },
    { kind: 'bestEarner', tone: 'good', service: 'Facial', revenueMinor: 1, bookings: 1 },
  ],
};

const textOf = (locale: 'en' | 'hi', data: Data) => {
  const html = renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'Asia/Kolkata', children: createElement(ShareWeek, { data, business: 'Maya Unisex' }) }),
  );
  const href = html.match(/href="([^"]+)"/)![1]!.replace(/&amp;/g, '&');
  expect(href.startsWith('https://wa.me/?text=')).toBe(true);
  return decodeURIComponent(href.slice('https://wa.me/?text='.length));
};

describe('Share this week', () => {
  it('AC-01 — the heading, five sentences and the top two to-dos, in English', () => {
    const text = textOf('en', base);
    expect(text).toBe(
      [
        'Maya Unisex — this week, 7 Oct to 13 Oct',
        'Money ₹22,730 — ₹9,634 more than the week before',
        'Visits 16 — 3 more than the week before',
        'New clients 3 — 5 fewer than the week before',
        'Came back 3 — Same as the week before',
        'Didn’t come 1 — 1 more than the week before',
        '',
        'To do:',
        '• 2 clients are due back',
        '• Wednesday 12 PM–1 PM is quiet most weeks',
      ].join('\n'),
    );
    expect(text).not.toContain('%');
  });

  it('reads in Hindi', () => {
    const text = textOf('hi', base);
    expect(text).toContain('Maya Unisex — इस हफ़्ते');
    expect(text).toContain('पैसा ₹22,730 — पिछले हफ़्ते से ₹9,634 ज़्यादा');
    expect(text).toContain('करने के लिए:');
    expect(text).toContain('बुधवार');
  });

  it('AC-02 — says there is nothing to compare with when last week was empty', () => {
    const empty = { value: 5, previous: null };
    const text = textOf('en', { ...base, week: { vs: 'week', money: empty, visits: empty, newClients: empty, cameBack: empty, noShows: empty } });
    expect((text.match(/Nothing to compare with yet/g) ?? []).length).toBe(5);
  });

  it('AC-03 — leaves the To do block out when there are no action cards', () => {
    const text = textOf('en', { ...base, cards: [base.cards[0]!] });
    expect(text).not.toContain('To do:');
    expect(text.split('\n').length).toBe(6);
  });
});
