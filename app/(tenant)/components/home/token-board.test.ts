import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import type { TokenRow } from '../../lib/home-types';
import { homeCopy } from '../../lib/home-copy';
import { LabelsProvider } from '../LabelsProvider';
import { TokenBoard, afterSheet, hasLiveWork } from './TokenBoard';
import { useTokenWords } from './token-words';
import { BookedToday, bookedNotOnBoard } from './BookedToday';
import type { BookingGroup } from '../../lib/appointment-display';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

/**
 * Jira GRW-404 (epic GRW-283) — the front desk's token board, rendered.
 *
 * The layout across the device matrix is `test/devices/token-board.spec.ts`; this reads what the board SAYS: each
 * token in the one column its state puts it in, the column counts, the empty states, the business's own noun
 * ("With doctor" for a clinic) and the Hindi.
 */

const NOW = '2026-09-26T06:00:00.000Z';
const row = (over: Partial<TokenRow>): TokenRow => ({
  id: over.id ?? 'q1',
  tokenNo: 1,
  state: 'waiting',
  customerId: null,
  customerName: 'Simran',
  customerPhone: null,
  serviceIds: [],
  serviceNames: [],
  offerId: null,
  addedAt: '2026-09-26T05:45:00.000Z',
  locationId: 'l1',
  appointmentId: null,
  booked: false,
  legIds: [],
  providerId: null,
  providerName: null,
  visitStartAt: null,
  paidMinor: null,
  paymentMode: null,
  ...over,
});

const TOKENS: TokenRow[] = [
  row({ id: 'a', tokenNo: 1, customerName: 'Simran' }),
  row({ id: 'b', tokenNo: 2, state: 'with_stylist', customerName: 'Aditi', serviceNames: ['Facial'], providerName: 'Rahul', visitStartAt: '2026-09-26T05:50:00.000Z', legIds: ['v2'] }),
  row({ id: 'c', tokenNo: 3, state: 'paid', customerName: 'Kabir', serviceNames: ['Haircut'], paidMinor: 30000, paymentMode: 'upi', legIds: ['v3'] }),
  row({ id: 'd', tokenNo: 4, state: 'left', customerName: 'Gone Early' }),
];

function Board({ tokens, lang }: { tokens: TokenRow[]; lang: 'en' | 'hi' }) {
  const w = useTokenWords();
  return createElement(TokenBoard, { t: homeCopy(lang, {}), w, tokens, providers: [], busy: new Map(), timezone: 'Asia/Kolkata', nowISO: NOW });
}

function boardSays(tokens: TokenRow[], labels: Record<string, string> = { provider: 'Stylist' }, lang: 'en' | 'hi' = 'en') {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: lang,
      messages: lang === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(LabelsProvider, { labels, children: createElement(Board, { tokens, lang }) }),
    }),
  );
}

/** The text of one column, by its state. */
const column = (html: string, col: string) => html.split(`data-col="${col}"`)[1]?.split('data-col=')[0] ?? '';

describe('the token board', () => {
  it('puts each token in the one column its state says, and counts them', () => {
    const html = boardSays(TOKENS);
    expect(column(html, 'waiting')).toContain('Simran');
    expect(column(html, 'waiting')).toContain('Services picked at payment');
    expect(column(html, 'with_stylist')).toContain('Aditi');
    expect(column(html, 'with_stylist')).toContain('Facial · Rahul');
    expect(column(html, 'paid')).toContain('Kabir');
    expect(column(html, 'paid')).toContain('₹300 · UPI');
    // Left without being served: on no column (the Day summary counts them).
    expect(html).not.toContain('Gone Early');
    expect(html).toContain('Waiting (1)');
    expect(html).toContain('With stylist (1)');
    expect(html).toContain('Paid (1)');
  });

  it('a waiting token can be given or paid; one with a stylist can be paid; a paid one has nothing to do', () => {
    const html = boardSays(TOKENS);
    expect(column(html, 'waiting')).toContain('Give to stylist');
    expect(column(html, 'waiting')).toContain('Record payment');
    expect(column(html, 'with_stylist')).toContain('Record payment');
    expect(column(html, 'with_stylist')).not.toContain('Give to');
    expect(column(html, 'paid')).not.toContain('<button');
  });

  it('a booked client’s token (Jira GRW-405) reads its booked time, not when they walked in', () => {
    const html = boardSays([row({ id: 'e', tokenNo: 5, state: 'with_stylist', booked: true, customerName: 'Ananya', visitStartAt: '2026-09-26T09:30:00.000Z', providerName: 'Rahul' })]);
    expect(column(html, 'with_stylist')).toContain('Booked 3:00 pm');
    expect(column(html, 'with_stylist')).not.toContain('Started');
  });

  it('names every row button with its token and client, so six "Record payment"s are not six of the same (review)', () => {
    const html = boardSays(TOKENS);
    expect(html).toContain('aria-label="Give to stylist — token 1, Simran"');
    expect(html).toContain('aria-label="Record payment — token 1, Simran"');
    expect(html).toContain('aria-label="Record payment — token 2, Aditi"');
  });

  it('each button’s name starts with the words it shows, so “click Record payment” finds it by voice (WCAG 2.5.3, review 2)', () => {
    for (const lang of ['en', 'hi'] as const) {
      const html = boardSays(TOKENS, { provider: 'Stylist' }, lang);
      const buttons = Array.from(html.matchAll(/<button[^>]*aria-label="([^"]*)"[^>]*>([^<]*)<\/button>/g)).filter((m) =>
        /hm-give/.test(m[0]),
      );
      expect(buttons.length, lang).toBe(3);
      for (const [, name, shown] of buttons) expect(name!.startsWith(shown!.trim()), `${lang}: "${name}" starts with "${shown}"`).toBe(true);
    }
  });

  describe('focus after a sheet closes (review 2: lost after the till saved)', () => {
    it('keeps waiting while the row is still in its column — the refresh has not landed yet', () => {
      // The till has closed; the dialog gave focus back to the row's own button; the board has not refreshed.
      expect(afterSheet({ lost: false, onItsRow: true, rowStillThere: true })).toEqual({ focus: false, keep: true });
      // Nothing had focus back: it goes to the row's place (still this row) and the wish is kept.
      expect(afterSheet({ lost: true, onItsRow: false, rowStillThere: true })).toEqual({ focus: true, keep: true });
    });

    it('when the refresh takes the row away with the focus, puts focus in its place and stops waiting', () => {
      expect(afterSheet({ lost: true, onItsRow: false, rowStillThere: false })).toEqual({ focus: true, keep: false });
    });

    it('leaves focus where a person put it, and stops waiting', () => {
      expect(afterSheet({ lost: false, onItsRow: false, rowStillThere: true })).toEqual({ focus: false, keep: false });
      expect(afterSheet({ lost: false, onItsRow: false, rowStillThere: false })).toEqual({ focus: false, keep: false });
    });
  });

  it('is a real tabs widget: one named tablist, one tab in the Tab order, each tab controlling its column (review)', () => {
    const html = boardSays(TOKENS);
    expect(html.match(/role="tablist"/g)).toHaveLength(1);
    expect(html).toMatch(/role="tablist" aria-label="Today(’|&#x27;|')s tokens"/);
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    for (const c of ['waiting', 'with_stylist', 'paid']) expect(html).toContain(`aria-controls="tb-col-${c}"`);
    // One accessible name for the widget: the board itself is not a second, identically named landmark.
    expect(html).not.toMatch(/class="tb-board"[^>]*aria-label/);
  });

  it('a client with no name reads "No name", never blank (review)', () => {
    const html = boardSays([row({ id: 'n', tokenNo: 9, customerName: null, customerPhone: null })]);
    expect(column(html, 'waiting')).toContain('No name');
  });

  it('says each column is empty in plain words', () => {
    const html = boardSays([]);
    expect(html).toContain('Nobody is waiting.');
    expect(html).toContain('Nobody is with a stylist right now.');
    expect(html).toContain('Nobody has paid yet.');
  });

  it('uses the business’s own noun: a clinic reads “With doctor”', () => {
    const html = boardSays(TOKENS, { provider: 'Doctor' });
    expect(html).toContain('With doctor (1)');
    expect(html).toContain('Give to doctor');
    // What a person reads — the state keys in the markup (`with_stylist`) are ids, not words.
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/stylist/i);
  });

  it('in Hindi, every word on it is Hindi', () => {
    const html = boardSays(TOKENS, { provider: 'Stylist' }, 'hi');
    expect(html).toContain('इंतज़ार (1)');
    expect(html).toContain('भुगतान हुआ (1)');
    expect(html).toContain('पेमेंट दर्ज करें');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/Waiting|Paid|Record payment|stylist/i);
  });
});

describe('the desk Home is the board (owner decision 2026-09-26)', () => {
  const home = readFileSync(new URL('./ReceptionHome.tsx', import.meta.url), 'utf8');

  it('replaces the Waiting / Later today / Done today tabs and the Here now card', () => {
    expect(home).toContain('<TokenBoard');
    expect(home).not.toMatch(/laterTodayTab|doneTodayTab|t\.hereNow/);
  });

  it('leads with New token, then Record payment, then New booking', () => {
    const order = ['w.newToken', 'w.recordPayment', 'w.newBooking'].map((k) => home.indexOf(k));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('keeps today’s bookings in reach, below the board', () => {
    expect(home).toContain('<BookedToday');
    expect(home.indexOf('<TokenBoard')).toBeLessThan(home.indexOf('<BookedToday'));
  });
});

describe('Booked for today (Jira GRW-405)', () => {
  const g = (id: string, over: Partial<{ bookedAhead: boolean; status: string }> = {}) =>
    ({
      key: id,
      status: over.status ?? 'confirmed',
      appointments: [{ id, status: over.status ?? 'confirmed', bookedAhead: over.bookedAhead }],
    }) as unknown as Parameters<typeof bookedNotOnBoard>[0][number];

  it('lists open bookings made ahead — not walk-ins (review), not ones already on the board, not settled ones', () => {
    const list = bookedNotOnBoard(
      [g('ahead', { bookedAhead: true }), g('walk-in', { bookedAhead: false }), g('on-board', { bookedAhead: true }), g('done', { status: 'completed' }), g('older-api')],
      new Set(['on-board']),
    );
    expect(list.map((x) => x.key)).toEqual(['ahead', 'older-api']);
  });

  it('Arrived is named after the word it shows, then who: “Arrived — Rekha” (WCAG 2.5.3, review 2)', () => {
    const group = {
      key: 'b1',
      appointments: [{ id: 'b1', status: 'confirmed', bookedAhead: true }],
      startAt: '2026-09-26T09:30:00.000Z',
      endAt: '2026-09-26T10:00:00.000Z',
      totalMin: 30,
      customerName: 'Rekha',
      serviceNames: ['Haircut'],
      providerNames: ['Rahul'],
    } as unknown as BookingGroup;
    function List({ lang }: { lang: 'en' | 'hi' }) {
      const w = useTokenWords();
      return createElement(BookedToday, { t: homeCopy(lang, {}), w, groups: [group], failed: false, timezone: 'Asia/Kolkata' });
    }
    for (const lang of ['en', 'hi'] as const) {
      const html = renderToStaticMarkup(
        createElement(NextIntlClientProvider, {
          locale: lang,
          messages: lang === 'en' ? en : hi,
          timeZone: 'Asia/Kolkata',
          children: createElement(LabelsProvider, { labels: { provider: 'Stylist' }, children: createElement(List, { lang }) }),
        }),
      );
      const [, name, shown] = html.match(/<button[^>]*aria-label="([^"]*)"[^>]*>([^<]*)<\/button>/) ?? [];
      expect(name, lang).toBe(`${shown} — Rekha`);
    }
  });
});

/**
 * Jira GRW-418 — when the owner's Home puts this board up.
 *
 * An owner who is their own front desk had nowhere to see a walk-in they had just added: the board was the
 * receptionist Home's alone, and `Right now` — a count, not a name — is hidden below 1101px. Their Home now
 * shows this same board, but only while there is something on it to act on, so a salon that has finished for
 * the day keeps the one-screen Home of Jira GRW-222.
 */
describe('hasLiveWork — whether the owner’s Home shows the board', () => {
  const tok = (state: TokenRow['state']) => ({ state });

  it('is true while somebody is waiting', () => {
    expect(hasLiveWork([tok('waiting')])).toBe(true);
  });

  it('is true while somebody is with a stylist', () => {
    expect(hasLiveWork([tok('with_stylist')])).toBe(true);
  });

  it('is false for a day that is only history — paid, left, cancelled', () => {
    expect(hasLiveWork([tok('paid'), tok('left'), tok('cancelled')])).toBe(false);
  });

  it('is false for an empty board', () => {
    expect(hasLiveWork([])).toBe(false);
  });

  // The mix an evening actually looks like: one client still in the chair among a day of paid tokens.
  it('is true when one live token hides among finished ones', () => {
    expect(hasLiveWork([tok('paid'), tok('paid'), tok('with_stylist'), tok('left')])).toBe(true);
  });
});

/**
 * Jira GRW-452 — a column keeps its height.
 *
 * The rule is CSS and the board is a client component with no layout in this environment, so the stylesheets are
 * read, as `queue-and-booking-say-what-happened.test.ts` reads the sheet it guards. What a browser measures is in
 * `test/devices/token-board.spec.ts` (growza): that the board's height does not move when tokens are added.
 */
describe('the board does not grow with the day', () => {
  const board = readFileSync(new URL('../../styles/95-token-board.css', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../../styles/83-role-home.css', import.meta.url), 'utf8');
  /** The `@media (min-width: 861px)` block that carries the cap. */
  const laptop = board.slice(board.indexOf('@media (min-width: 861px)'));
  const rule = laptop.slice(laptop.indexOf('.tb-rows {'), laptop.indexOf('}', laptop.indexOf('.tb-rows {')));

  it('caps the list and scrolls it, from 861px', () => {
    expect(board).toMatch(/@media \(min-width: 861px\)/);
    expect(rule).toMatch(/max-height:/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
  });

  it('keeps a column’s scroll inside that column', () => {
    expect(rule).toMatch(/overscroll-behavior:\s*contain/);
  });

  it('leaves room for a scrollbar, so it cannot sit on the waiting time', () => {
    expect(rule).toMatch(/padding-right:/);
  });

  it('caps the LIST, never the column — one row must still stand at one row', () => {
    // A `height` or a `min-height` on `.tb-col` would pad an empty column out to the cap.
    const colRules = board.match(/\.tb-col[^{]*\{[^}]*\}/g) ?? [];
    expect(colRules.length).toBeGreaterThan(0);
    for (const r of colRules) expect(r).not.toMatch(/(^|[^-])(min-)?height:/);
  });

  it('leaves the phone alone — one column per tab is already compact', () => {
    const phone = board.slice(board.indexOf('@media (max-width: 860px)'), board.indexOf('@media (min-width: 861px)'));
    expect(phone).not.toMatch(/max-height/);
  });

  it('gives the owner’s one-screen Home a lower cap, because there the board is one row of four', () => {
    const fit = home.slice(home.indexOf('@media (min-width: 1101px) and (min-height: 680px)'));
    expect(fit).toMatch(/\.hm-fit \.tb-rows \{\s*max-height:/);
  });
});
