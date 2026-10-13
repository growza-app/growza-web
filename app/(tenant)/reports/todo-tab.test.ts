import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { ReportTodo } from '../lib/api';
import { TodoTab } from './TodoTab';
import { MessageClientsSheet } from './MessageClientsSheet';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/reports',
}));

/**
 * What to do renders every card as a sentence, a number and a button, in both
 * languages, and the people sheet carries the typed message in the owner's
 * language on a `wa.me` link.
 */
const wrap = (locale: 'en' | 'hi', child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: child,
    }),
  );

const priya = {
  customerId: 'c1',
  name: 'Priya',
  initial: 'P',
  waPhone: '+919999900001',
  optedOut: false,
  lastVisitDays: 35,
  intervalDays: 30,
  avgTicketMinor: 80000,
  usualService: 'Haircut',
};
const quiet = { ...priya, customerId: 'c2', name: 'Asha', initial: 'A', waPhone: null, optedOut: true };

const full: ReportTodo = {
  weekStartISO: '2026-09-13T00:00:00.000Z',
  weekEndExclusiveISO: '2026-09-20T00:00:00.000Z',
  monthLabel: 'This month',
  possible: 7,
  cards: [
    { kind: 'money', tone: 'good', revenueMinor: 385000, previousMinor: 300000, bookings: 12 },
    { kind: 'dueBack', tone: 'warn', count: 2, clients: [priya, quiet] },
    { kind: 'stopped', tone: 'bad', count: 1, clients: [priya] },
    { kind: 'noShow', tone: 'bad', count: 1, clients: [priya] },
    { kind: 'quietHours', tone: 'warn', weekday: 2, fromHour: 14, toHour: 15 },
    { kind: 'bestEarner', tone: 'good', service: 'Anti-Ageing Facial', revenueMinor: 1200000, bookings: 0 },
    { kind: 'unreachable', tone: 'warn', count: 3, noPhone: 1, optedOut: 2 },
  ],
};

const tab = (locale: 'en' | 'hi', data: ReportTodo) =>
  wrap(locale, createElement(TodoTab, { data, tenantName: 'Maya Unisex', onTab: () => {} }));

describe('What to do', () => {
  it('says each card as a sentence with its number, in English', () => {
    const html = tab('en', full);
    expect(html).toContain('Money this week');
    expect(html).toContain('₹3,850');
    expect(html).toContain('₹850 more than last week');
    expect(html).toContain('2 clients are due back');
    expect(html).toContain('1 regular has stopped coming');
    expect(html).toContain('1 person didn’t come this week');
    expect(html).toContain('Tuesday 2 PM–3 PM is quiet most weeks');
    expect(html).toContain('Anti-Ageing Facial earned the most this month');
    expect(html).toContain('3 clients can’t be messaged');
    expect(html).toContain('2 asked not to be contacted. 1 has no number.');
    // The verdict is a dot with words behind it.
    expect(html).toContain('aria-label="Good"');
    expect(html).toContain('aria-label="Needs you"');
    // No chart, no percentage (links carry encoded text, so they are set aside).
    expect(html.replace(/href="[^"]*"/g, '')).not.toContain('%');
  });

  it('reads in Hindi', () => {
    const html = tab('hi', full);
    expect(html).toContain('इस हफ़्ते का पैसा');
    expect(html).toContain('2 ग्राहकों के लौटने का समय हो गया');
    expect(html).toContain('मंगलवार');
  });

  it('shows one calm card when there is nothing to do', () => {
    const html = tab('en', { ...full, cards: [full.cards[0]!] });
    expect(html).toContain('Nothing to do this week.');
    expect(html).not.toContain('Message them');
  });

  it('hides the money comparison when last week had nothing', () => {
    const html = tab('en', { ...full, cards: [{ kind: 'money', tone: 'good', revenueMinor: 0, previousMinor: null, bookings: 0 }] });
    expect(html).toContain('No bookings the week before');
  });
});

describe('the people sheet', () => {
  it('types the message in the owner’s language on a wa.me link, and offers a call', () => {
    const html = wrap(
      'hi',
      createElement(MessageClientsSheet, {
        title: 'x',
        clients: [priya, quiet],
        text: (c) => `नमस्ते ${c.name}`,
        onClose: () => {},
      }),
    );
    expect(html).toContain(`https://wa.me/919999900001?text=${encodeURIComponent('नमस्ते Priya')}`);
    expect(html).toContain('href="tel:+919999900001"');
    // The client who opted out gets the reason, not a button.
    expect(html).toContain('संपर्क न करने को कहा है');
    expect((html.match(/wa\.me/g) ?? []).length).toBe(1);
    expect(html).toContain('आख़िरी बार 35 दिन पहले');
  });
});
