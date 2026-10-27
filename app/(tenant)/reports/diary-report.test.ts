import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { DiaryReportPage } from '../lib/api-types';
import { LabelsProvider } from '../components/LabelsProvider';
import { DiaryCards } from './DiaryReport';

/**
 * Jira GRW-591 — the diary report reads in both languages, and the fourth card borrows its words.
 *
 * Two things worth defending, beyond "it renders":
 *   - the payload carries no prose, so a sentence that moves into the response breaks the Hindi render
 *     here rather than on an owner's phone (the lesson `reports-i18n.test.ts` was written for);
 *   - the bands are printed in the Clients list's own words, so a client cannot be "Slipping away" on one
 *     screen and something else on the other, and the no-stylist row is the product's one phrase for it.
 */

const SALON = { provider: 'Stylist', providers: 'Staff', customers: 'Clients' };

const payload: DiaryReportPage = {
  window: { key: 'last_7_days', label: 'Last 7 days', startISO: '2026-10-19T00:00:00+05:30', endExclusiveISO: '2026-10-26T00:00:00+05:30' },
  previous: { startISO: '2026-10-12T00:00:00+05:30', endExclusiveISO: '2026-10-19T00:00:00+05:30', hasData: true },
  anyVisits: true,
  takings: {
    totalMinor: '4850000',
    previousMinor: '4100000',
    changePct: 18.3,
    differenceMinor: '750000',
    visits: 41,
    averageVisitMinor: 118293,
    previousAverageVisitMinor: 110810,
    serviceMinor: '4850000',
    otherMinor: '0',
    noShows: 2,
    previousNoShows: 1,
    byDay: [
      { dateISO: '2026-10-19', dow: 1, valueMinor: '620000' },
      { dateISO: '2026-10-20', dow: 2, valueMinor: '0' },
      { dateISO: '2026-10-21', dow: 3, valueMinor: '740000' },
      { dateISO: '2026-10-22', dow: 4, valueMinor: '690000' },
      { dateISO: '2026-10-23', dow: 5, valueMinor: '880000' },
      { dateISO: '2026-10-24', dow: 6, valueMinor: '1260000' },
      { dateISO: '2026-10-25', dow: 7, valueMinor: '660000' },
    ],
  },
  people: {
    rows: [
      { id: 'p1', name: 'Priya', count: 18, valueMinor: '2037000', sharePct: 42 },
      { id: 'p2', name: 'Fatima', count: 14, valueMinor: '1455000', sharePct: 30 },
      { id: '', name: 'Unassigned', count: 3, valueMinor: '340000', sharePct: 7, key: 'unassigned' },
    ],
    distinct: 5,
    leader: { name: 'Priya', sharePct: 42 },
  },
  services: {
    rows: [
      { id: 'Haircut', name: 'Haircut', count: 0, valueMinor: '1940000', sharePct: 40 },
      { id: 'Colour', name: 'Colour', count: 0, valueMinor: '1310000', sharePct: 27 },
    ],
    distinct: 2,
    leader: { name: 'Haircut', sharePct: 40 },
    slow: [{ id: 's9', name: 'Beard trim', count: 0 }],
    slowTotal: 3,
    menuTotal: 12,
  },
  back: {
    segments: [
      { key: 'active', count: 112, range: { from: 0, to: 30 } },
      { key: 'due', count: 23, range: { from: 31, to: 45 } },
      { key: 'at_risk', count: 14, range: { from: 46, to: 90 } },
      { key: 'inactive', count: 38, range: { from: 91, to: null } },
    ],
    worthACall: [
      { customerId: 'c1', name: 'Asha', lastVisitDays: 36, daysOverdue: 22, avgTicketMinor: 100000 },
      { customerId: 'c2', name: 'Ravi', lastVisitDays: 52, daysOverdue: 12, avgTicketMinor: 65000 },
    ],
    worthACallTotal: 9,
  },
};

const render = (locale: 'en' | 'hi', data: DiaryReportPage = payload) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(LabelsProvider, { labels: SALON, children: createElement(DiaryCards, { data }) }),
    }),
  );

/** The markup's text, tags removed, so an assertion reads what the owner reads. */
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the four cards say something, in English', () => {
  const out = text(render('en'));

  it('leads with the money, how it compares, and who did not turn up', () => {
    expect(out).toContain('You took in');
    expect(out).toContain('₹48,500');
    expect(out).toContain('₹7,500 more than the period before');
    expect(out).toContain('41 visits');
    expect(out).toContain('2 booked and did not come');
  });

  it('turns the floor into a sentence, and borrows the product’s one phrase for a visit with no stylist', () => {
    expect(out).toContain('Priya brought in 42% of it.');
    expect(out).toContain('and 2 more');
    // Never a wording of this screen's own: `no-stylist-i18n.test.ts` keeps there being exactly one.
    expect(out).toContain('No stylist');
    expect(out).not.toContain('Unassigned');
  });

  it('names what people come for, and what is on the menu and barely booked', () => {
    expect(out).toContain('Haircut is 40% of what you earn.');
    // Three barely booked out of twelve, and only one can be named: the count is the honest line.
    expect(out).toContain('3 of your 12 services weren’t booked');
    expect(out).not.toContain('Beard trim');
  });

  it('names them when there are few enough to name honestly', () => {
    const few: DiaryReportPage = { ...payload, services: { ...payload.services, slowTotal: 1 } };
    expect(text(render('en', few))).toContain('Barely booked: Beard trim');
  });

  it('bands the book in the Clients list’s own words, and names who is worth a message', () => {
    expect(out).toContain('Coming in');
    expect(out).toContain('Slipping away');
    expect(out).toContain('Gone quiet');
    // The vertical's own boundaries, worded from numbers the API sent.
    expect(out).toContain('46–90 days');
    expect(out).toContain('9 clients are past their usual gap.');
    expect(out).toContain('Asha');
    expect(out).toContain('Last in 36 days ago');
    expect(out).toContain('about ₹1,000 a visit');
  });

  it('sends the message from What to do rather than growing a second way to send it', () => {
    expect(render('en')).toContain('href="/reports?tab=todo"');
  });

  it('names the money the two cards below are not made of, so the shares still add up', () => {
    // QA L1: a shelf sale lifts the headline and must not move anybody's share.
    const withShelf: DiaryReportPage = {
      ...payload,
      takings: { ...payload.takings, totalMinor: '5150000', serviceMinor: '4850000', otherMinor: '300000' },
    };
    const shown = text(render('en', withShelf));
    expect(shown).toContain('₹3,000 came from things sold rather than booked');
    // The shares are unchanged by it.
    expect(shown).toContain('Priya brought in 42% of it.');
    // ...and the line is absent when there is nothing to explain.
    expect(text(render('en'))).not.toContain('came from things sold rather than booked');
  });

  it('gives a bar to every day of the period, including the one that took nothing', () => {
    const html = render('en');
    expect((html.match(/cr-bar-col/g) ?? []).length).toBe(7);
    expect(html).toContain('height:0%');
  });
});

describe('the same cards in Hindi', () => {
  const out = text(render('hi'));

  it('words every heading and sentence in Hindi, not just the numbers', () => {
    expect(out).toContain('कौन कमाता है');
    expect(out).toContain('लोग किसलिए आते हैं');
    expect(out).toContain('कौन वापस नहीं आया');
    expect(out).toContain('इसमें से 42% Priya लाए।');
  });

  it('leaves no English sentence behind — the payload carries none to leak', () => {
    for (const phrase of ['You took in', 'brought in', 'of what you earn', 'past their usual gap', 'Coming in']) {
      expect(out).not.toContain(phrase);
    }
  });
});

describe('what it does when it has not earned the right to say something', () => {
  it('says so once when nothing happened, rather than drawing four empty cards', () => {
    const out = text(render('en', { ...payload, anyVisits: false }));
    expect(out).toContain('Nothing happened in this period');
    expect(out).not.toContain('You took in');
    expect(out).not.toContain('Who has not come back');
  });

  it('draws three cards for a business that does not rank its people', () => {
    const out = text(render('en', { ...payload, people: null }));
    // A clinic has no doctor leaderboard: the card is absent, not an empty frame.
    expect(out).not.toContain('Who earns it');
    expect(out).toContain('What they come for');
    expect(out).toContain('Who has not come back');
  });

  it('claims nothing to compare with, and no nudges, when there are none', () => {
    const quiet: DiaryReportPage = {
      ...payload,
      previous: { ...payload.previous, hasData: false },
      takings: { ...payload.takings, previousMinor: null, changePct: null, differenceMinor: null, previousAverageVisitMinor: null, noShows: 0 },
      back: { ...payload.back, worthACall: [], worthACallTotal: 0 },
    };
    const out = text(render('en', quiet));
    expect(out).toContain('Nothing to compare with yet');
    expect(out).toContain('Nobody is due a nudge right now.');
    expect(out).not.toContain('booked and did not come');
    // The bands are still there: they are the state of the book, not a nudge list.
    expect(out).toContain('Gone quiet');
  });
});

describe('the message files', () => {
  const flat = (obj: unknown, path = ''): Array<[string, string]> =>
    typeof obj === 'string'
      ? [[path, obj]]
      : Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flat(v, path ? `${path}.${k}` : k));

  it('carry the same keys in both languages', () => {
    expect(flat(hi.diaryReport).map(([k]) => k).sort()).toEqual(flat(en.diaryReport).map(([k]) => k).sort());
  });

  it('carry the same placeholders in each key, so a Hindi sentence cannot lose its number', () => {
    // The name of each ICU argument: the first word inside a brace that a comma or a close-brace follows.
    const placeholders = (s: string) => [...s.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1]).sort();
    const hiBy = new Map(flat(hi.diaryReport));
    for (const [key, value] of flat(en.diaryReport)) {
      expect(placeholders(hiBy.get(key)!), key).toEqual(placeholders(value));
    }
  });
});
