import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mayTryAgain, queueHead, queueItemKey, queueReasonKey } from '../../../lib/channel-keys-state';
import type { ChannelQueueSummary } from '../../../lib/api-types';

/**
 * Jira GRW-626 — the queue screen, pinned at the source.
 *
 * What was checked in a browser at 344px is in the PR. These keep the rules that must not drift: the headline says the one thing that matters
 * in the order an owner needs it, what is merely waiting is counted and not listed, a row is a sentence with its reason in plain words and never
 * a code, Try again is offered only when it can do something, and every sentence has a Hindi twin.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./QueueClient.tsx');
const page = here('./page.tsx');
const stock = readFileSync(path.resolve(import.meta.dirname, '../ChannelStock.tsx'), 'utf8');
const css = readFileSync(path.resolve(import.meta.dirname, '../../../styles/99-channels.css'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../../messages', `${lang}.json`), 'utf8')).settingsChannelQueue as Record<string, unknown>;

const summary = (over: Partial<ChannelQueueSummary> = {}): ChannelQueueSummary => ({
  channel: 'flipkart',
  sizes: { waiting: 0, stuck: 0 },
  messages: { waiting: 0, refused: 0, stuck: 0 },
  ordersIn: { lastBroughtInAt: null, reason: null, unreadable: 0 },
  keysRejected: false,
  backingOff: 0,
  holdUntil: null,
  needsAttention: 0,
  ...over,
});

describe('the headline says the one thing that matters', () => {
  it('keys turned down come first: nothing else can be fixed by asking again until they are replaced', () => {
    expect(queueHead(summary({ keysRejected: true, needsAttention: 4, holdUntil: '2026-10-21T10:00:00Z' }))).toEqual({ key: 'keysRejected', tone: 'bad' });
  });
  it('then what needs the owner, then a wait the marketplace asked for, then what is merely waiting, then good news', () => {
    expect(queueHead(summary({ needsAttention: 2 }))).toEqual({ key: 'needsAttention', tone: 'bad' });
    expect(queueHead(summary({ holdUntil: '2026-10-21T10:00:00Z' }))).toEqual({ key: 'holding', tone: 'idle' });
    expect(queueHead(summary({ sizes: { waiting: 900, stuck: 0 } }))).toEqual({ key: 'waiting', tone: 'idle' });
    expect(queueHead(summary({ messages: { waiting: 1, refused: 0, stuck: 0 } }))).toEqual({ key: 'waiting', tone: 'idle' });
    expect(queueHead(summary())).toEqual({ key: 'allClear', tone: 'ok' });
  });
});

describe('Try again is offered only when it can do something', () => {
  it('not when nothing is stopped or backing off, not for sizes merely waiting their turn, and not for a wait the marketplace asked for', () => {
    expect(mayTryAgain(summary())).toBe(false);
    expect(mayTryAgain(summary({ sizes: { waiting: 3000, stuck: 0 } }))).toBe(false);
    expect(mayTryAgain(summary({ holdUntil: '2026-10-21T10:00:00Z', messages: { waiting: 4, refused: 0, stuck: 0 } }))).toBe(false);
  });
  it('when something stopped, or is waiting on its own backoff after a failure', () => {
    expect(mayTryAgain(summary({ needsAttention: 1 }))).toBe(true);
    expect(mayTryAgain(summary({ backingOff: 3 }))).toBe(true);
  });
  it('never when the keys were turned down: asking again cannot fix them, and the API refuses', () => {
    expect(mayTryAgain(summary({ keysRejected: true, needsAttention: 3, backingOff: 2 }))).toBe(false);
  });
});

describe('a row is a sentence in plain words', () => {
  it('names what is wrong with it from the area and the state', () => {
    expect(queueItemKey({ area: 'stock', state: 'stuck' })).toBe('sizeStuck');
    expect(queueItemKey({ area: 'order', state: 'waiting' })).toBe('orderWaiting');
    expect(queueItemKey({ area: 'order', state: 'stuck' })).toBe('orderStuck');
    expect(queueItemKey({ area: 'order', state: 'refused' })).toBe('orderRefused');
  });
  it('turns a reason from the closed sets into words, and anything this build does not know into "other"', () => {
    for (const r of ['not_listed', 'invalid', 'order_cancelled', 'order_unknown', 'not_allowed', 'other']) expect(queueReasonKey(r)).toBe(r);
    expect(queueReasonKey(null)).toBe('other');
    expect(queueReasonKey('429 Too Many Requests: buyer Asha')).toBe('other');
  });
  it('has a sentence for every reason, in both languages', () => {
    for (const r of ['not_listed', 'invalid', 'order_cancelled', 'order_unknown', 'not_allowed', 'other']) {
      expect((messages('en').reason as Record<string, string>)[r]).toBeTruthy();
      expect((messages('hi').reason as Record<string, string>)[r]).toBeTruthy();
    }
  });
});

describe('the screen', () => {
  it('is the owner’s and the manager’s, and a shop’s: anyone else is sent back to Settings', () => {
    expect(page).toContain("role === undefined || role === 'owner' || role === 'manager'");
    expect(page).toContain("if (me.surface !== 'shop') redirect('/settings')");
  });

  it('is paged on the server, and counts what is waiting without listing it', () => {
    expect(client).toContain('const PAGE_SIZE = 10');
    expect(client).toContain('api.channelQueue(channel, page, PAGE_SIZE)');
    expect(client).toContain('<Pagination');
    expect(client).toContain("t('countSizesWaiting'");
  });

  it('a page that emptied under the person steps back; a failed refresh keeps what was on screen and says so', () => {
    expect(client).toContain('res.items.length === 0 && res.total > 0 && page > 1');
    expect(client).toContain("t('loadErrorKept')");
  });

  it('Try again is one at a time, keeps focus while busy (aria-disabled, not disabled), is full width where a thumb is, and is announced from one live region', () => {
    expect(client).toContain('inFlight.current');
    expect(client).toContain('aria-disabled={busy}');
    expect(client).not.toMatch(/(?<![-\w])disabled=\{/);
    expect(client).toContain('role="status" aria-live="polite"');
    expect(css).toMatch(/\.cq-actions \.stc-btn \{[^}]*flex: 1 1 100%/);
  });

  it('keys the marketplace turned down get a way to replace them, not a retry that cannot work', () => {
    expect(client).toContain('s.keysRejected ? (');
    expect(client).toContain('mayTryAgain(s)');
    expect(client).toContain('href="/settings/channels"');
  });

  it('is linked from Settings › Online selling, a thumb tall', () => {
    expect(stock).toContain('href={`/settings/channels/queue?channel=${conn.channel}`}');
    expect(css).toMatch(/\.stc-link \{[^}]*min-height: 2\.75rem/);
  });

  it('rows stack and wrap at 344px, and use the tokens: no pixel type, no icon, no animation', () => {
    expect(css).toMatch(/\.cq-row \{[^}]*flex-direction: column/);
    expect(css).toMatch(/\.cq-row-text \{[^}]*overflow-wrap: anywhere/);
    const block = css.slice(css.indexOf('.cq {'));
    expect(block).not.toMatch(/font-size:\s*\d+px|animation|transition/);
    expect(client).not.toMatch(/<svg|[\u{1F300}-\u{1FAFF}]/u);
  });

  it('prints times in the shop’s zone and the reader’s language', () => {
    expect(client).toContain('timeZone: timezone');
    expect(client).toContain('intlLocale(locale)');
  });
});

describe('Hindi plurals: a literal 1 in a `one` branch reads "1" for none', () => {
  // CLDR puts 0 in Hindi's `one` category (i = 0 or n = 1), so `one {1 …}` is what the reader sees when there are none.
  const hiAll = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../../messages/hi.json'), 'utf8')) as Record<string, unknown>;
  const strings = (o: unknown, p = ''): Array<[string, string]> => (typeof o === 'string' ? [[p, o]] : o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => strings(v, `${p}${k}.`)) : []);
  const mine = [...strings(hiAll.settingsChannelQueue, 'settingsChannelQueue.'), ...strings(hiAll.settingsChannels, 'settingsChannels.'), ...strings((hiAll.orders as Record<string, unknown>).bringIn, 'orders.bringIn.'), ...strings((hiAll.orders as Record<string, unknown>).tell, 'orders.tell.')];
  it.each(mine.filter(([, v]) => v.includes('one {')))('%s uses # in its one-branch', (_id, v) => {
    for (const branch of v.matchAll(/one \{([^{}]*)\}/g)) expect(branch[1]).not.toMatch(/(?<![\w#])1(?![\w])/);
  });
});

describe('every sentence has a Hindi twin, with the same placeholders', () => {
  const flat = (o: Record<string, unknown>, p = ''): Array<[string, string]> => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${p}${k}`, v] as [string, string]] : flat(v as Record<string, unknown>, `${p}${k}.`)));
  const en = flat(messages('en'));
  const hi = new Map(flat(messages('hi')));
  it('there are some to check', () => expect(en.length).toBeGreaterThanOrEqual(38));
  it.each(en)('%s', (id, text) => {
    const h = hi.get(id);
    expect(h, `hi.json is missing settingsChannelQueue.${id}`).toBeTruthy();
    const holes = (s: string) => [...s.matchAll(/\{(\w+)[,}]/g)].map((x) => x[1]).sort();
    expect(holes(h!)).toEqual(holes(text));
    if (!['flipkart', 'amazon'].includes(id)) expect(h).not.toBe(text);
  });
});
