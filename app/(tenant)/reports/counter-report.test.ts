import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { CounterReportPage } from '../lib/api-types';
import { CounterCards } from './CounterReport';

/**
 * Jira GRW-591 — the counter report reads in both languages, and says something in each.
 *
 * The thing worth defending here is not the layout, it is that the API sends FIGURES and the screen writes
 * the sentence. The payload below contains no prose at all — `{ name, pct }`, `{ fromHour, toHour }`,
 * `{ dow }` — so if a sentence ever moves into the response, the Hindi render stops being Hindi and these
 * fail. That is the defect `reports-i18n.test.ts` was written for after the client-band ranges shipped as
 * the English string "0–14 days".
 */

const DEVANAGARI = /[ऀ-ॿ]/;

const payload: CounterReportPage = {
  window: { key: 'last_7_days', label: 'Last 7 days', startISO: '2026-10-19T00:00:00+05:30', endExclusiveISO: '2026-10-26T00:00:00+05:30' },
  previous: { startISO: '2026-10-12T00:00:00+05:30', endExclusiveISO: '2026-10-19T00:00:00+05:30', hasData: true },
  anySales: true,
  takings: {
    totalMinor: '2721200',
    previousMinor: '2327200',
    changePct: 16.9,
    differenceMinor: '394000',
    bills: 30,
    averageBillMinor: 90707,
    previousAverageBillMinor: 108800,
    byDay: [
      { dateISO: '2026-10-19', dow: 1, valueMinor: '310000' },
      { dateISO: '2026-10-20', dow: 2, valueMinor: '0' },
      { dateISO: '2026-10-21', dow: 3, valueMinor: '402000' },
      { dateISO: '2026-10-22', dow: 4, valueMinor: '290000' },
      { dateISO: '2026-10-23', dow: 5, valueMinor: '540000' },
      { dateISO: '2026-10-24', dow: 6, valueMinor: '720000' },
      { dateISO: '2026-10-25', dow: 7, valueMinor: '459200' },
    ],
  },
  earners: {
    rows: [
      { id: 'p1', name: 'Chicken Biryani', qty: 41, valueMinor: '840500', sharePct: 31 },
      { id: 'p2', name: 'Butter Chicken', qty: 22, valueMinor: '506000', sharePct: 19 },
    ],
    distinct: 14,
    leader: { name: 'Chicken Biryani', sharePct: 31 },
    slow: [{ id: 'p9', name: 'Lemon Soda', qty: 0 }],
    slowTotal: 3,
    menuTotal: 26,
  },
  busy: {
    byHour: [
      { hour: 12, valueMinor: '200000' },
      { hour: 13, valueMinor: '310000' },
      { hour: 20, valueMinor: '620000' },
      { hour: 21, valueMinor: '880000' },
      { hour: 22, valueMinor: '711200' },
    ],
    peak: { fromHour: 20, toHour: 23, valueMinor: '2211200' },
    quietestDay: { dow: 2, valueMinor: '0' },
  },
  changed: {
    up: [{ id: 'p3', name: 'Chicken 65', qty: 31, previousQty: 13, deltaQty: 18 }],
    down: [{ id: 'p4', name: 'Mutton Biryani', qty: 9, previousQty: 20, deltaQty: -11 }],
  },
};

const render = (locale: 'en' | 'hi', data: CounterReportPage = payload) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(CounterCards, { data }),
    }),
  );

/** The markup's text, with the tags taken out, so an assertion reads what the owner reads. */
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the four cards say something, in English', () => {
  const out = text(render('en'));

  it('leads with the money and how it compares', () => {
    expect(out).toContain('You took in');
    expect(out).toContain('₹27,212');
    expect(out).toContain('₹3,940 more than the period before');
    expect(out).toContain('30 orders');
  });

  it('turns the leader row into the sentence, rather than leaving a share column to read', () => {
    expect(out).toContain('Chicken Biryani is 31% of everything you earn.');
    expect(out).toContain('and 12 more');
  });

  it('gives the count against the menu rather than five arbitrary names', () => {
    // Three barely moved out of twenty-six, and the card can name only one of them: naming it alone
    // would imply the other two are fine.
    expect(out).toContain('3 of your 26 aren’t selling');
    expect(out).not.toContain('Lemon Soda');
  });

  it('names them when there are few enough to name honestly', () => {
    const few = { ...payload, earners: { ...payload.earners, slowTotal: 1 } };
    expect(text(render('en', few))).toContain('Barely moved: Lemon Soda');
  });

  it('names the rush as hours, and the slow day beside it', () => {
    expect(out).toContain('Your rush is 8 pm–11 pm.');
    expect(out).toContain('Tuesday is your weakest day');
  });

  it('says what moved, both ways, and what happened to the order size', () => {
    expect(out).toContain('Chicken 65');
    expect(out).toContain('up 18');
    expect(out).toContain('Mutton Biryani');
    expect(out).toContain('down 11');
    expect(out).toContain('₹1,088 → ₹907.07');
  });

  it('gives a bar to every day of the period, including the one that took nothing', () => {
    const html = render('en');
    expect(html.match(/cr-bars-day/g)).toHaveLength(1);
    expect((html.match(/cr-bar-col/g) ?? []).length).toBe(7 + 5);
    // The quiet Tuesday is a column at zero height, not a missing column.
    expect(html).toContain('height:0%');
  });
});

describe('the same cards in Hindi', () => {
  const out = text(render('hi'));

  it('words every heading and sentence in Hindi, not just the numbers', () => {
    expect(out).toContain('पैसा कहाँ से आता है');
    expect(out).toContain('भीड़ कब होती है');
    expect(out).toContain('क्या बदला');
    expect(out).toContain('आपकी पूरी कमाई का 31% Chicken Biryani है।');
  });

  it('leaves no English sentence behind — the payload carries none to leak', () => {
    for (const phrase of ['You took in', 'What changed', 'of everything you earn', 'Your rush is', 'weakest day']) {
      expect(out).not.toContain(phrase);
    }
  });

  it('takes its weekday names from Intl, so neither language keeps a list of seven', () => {
    // Tuesday in hi-IN. Nothing in messages/hi.json spells it; a drift between the two is impossible.
    expect(out).toMatch(DEVANAGARI);
    expect(JSON.stringify(hi.counterReport)).not.toContain('मंगल');
    expect(JSON.stringify(en.counterReport)).not.toContain('Tuesday');
  });
});

describe('what it does when there is nothing to say', () => {
  it('says so once, rather than drawing four empty cards', () => {
    const quiet: CounterReportPage = {
      ...payload,
      anySales: false,
    };
    const out = text(render('en', quiet));
    expect(out).toContain('Nothing sold in this period');
    expect(out).not.toContain('You took in');
    expect(out).not.toContain('What changed');
  });

  it('claims no movement, and no rush, when it has not earned the right to', () => {
    const first: CounterReportPage = {
      ...payload,
      previous: { ...payload.previous, hasData: false },
      takings: { ...payload.takings, previousMinor: null, changePct: null, differenceMinor: null, previousAverageBillMinor: null },
      busy: { byHour: [{ hour: 13, valueMinor: '200000' }], peak: null, quietestDay: null },
      changed: { up: [], down: [] },
    };
    const out = text(render('en', first));
    expect(out).toContain('Nothing to compare with yet');
    expect(out).toContain('this is your first period');
    expect(out).toContain('Not enough trade yet to tell you when your rush is.');
    // No arrow line for an order size there is nothing to compare against.
    expect(out).not.toContain('→');
  });
});

describe('the message files', () => {
  const walk = (obj: unknown, path = ''): string[] =>
    typeof obj === 'string'
      ? [path]
      : Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => walk(v, path ? `${path}.${k}` : k));

  it('carry the same keys in both languages', () => {
    expect(walk(hi.counterReport).sort()).toEqual(walk(en.counterReport).sort());
  });

  it('carry the same placeholders in each key, so a Hindi sentence cannot lose its number', () => {
    // The name of each ICU argument: the first word inside a brace that a comma or a close-brace follows.
    // Matching `{(\w+)` alone would read the plain words that open a plural's branches ("{and # more}").
    const placeholders = (s: string) => [...s.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1]).sort();
    const flat = (obj: unknown, path = ''): Array<[string, string]> =>
      typeof obj === 'string'
        ? [[path, obj]]
        : Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flat(v, path ? `${path}.${k}` : k));
    const hiBy = new Map(flat(hi.counterReport));
    for (const [key, value] of flat(en.counterReport)) {
      expect(placeholders(hiBy.get(key)!), key).toEqual(placeholders(value));
    }
  });
});
