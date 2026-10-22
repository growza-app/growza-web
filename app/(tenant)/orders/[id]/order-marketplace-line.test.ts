import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tellLines } from '../../lib/channel-keys-state';
import type { OrderMarketplaceMessage } from '../../lib/api-types';

/**
 * Jira GRW-625 — what the marketplace was told about an order, pinned at the source.
 *
 * What was checked in a browser at 344px is in the PR. These keep the rules that must not drift: a counter sale says nothing, the worst news
 * comes first, "not told yet" is drawn as the ordinary thing it is and only a refusal or a message that could not be sent is a problem,
 * asking again is offered only to the roles the API accepts, and every sentence has a Hindi twin.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const line = here('./OrderMarketplaceLine.tsx');
const screen = here('./OrderClient.tsx');
const list = readFileSync(path.resolve(import.meta.dirname, '../OrdersClient.tsx'), 'utf8');
const css = readFileSync(path.resolve(import.meta.dirname, '../../styles/99-orders.css'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).orders as { tell: Record<string, unknown>; list: Record<string, string> };

const m = (over: Partial<OrderMarketplaceMessage>): OrderMarketplaceMessage => ({ kind: 'dispatch', state: 'pending', stuck: false, at: null, reason: null, ...over });

describe('what the line says', () => {
  it('says nothing when nothing was told: a counter sale has no marketplace', () => {
    expect(tellLines(undefined)).toEqual([]);
    expect(tellLines([])).toEqual([]);
  });

  it('an accepted message says when, and offers no retry', () => {
    expect(tellLines([m({ state: 'accepted', at: '2026-10-21T04:42:00Z' })])).toEqual([{ kind: 'dispatch', key: 'accepted', tone: 'ok', at: '2026-10-21T04:42:00Z', reason: null, retry: false }]);
  });

  it('"not told yet" is the ordinary word for a queued message — idle, not alarming — with a way to ask again', () => {
    expect(tellLines([m({})])[0]).toMatchObject({ key: 'pending', tone: 'idle', retry: true });
  });

  it('a message that could not be sent after repeated tries, and a refusal, are the two problems, each with a way to ask again and the refusal with its reason', () => {
    expect(tellLines([m({ stuck: true })])[0]).toMatchObject({ key: 'stuck', tone: 'bad', retry: true });
    expect(tellLines([m({ state: 'refused', reason: 'order_cancelled' })])[0]).toMatchObject({ key: 'refused', tone: 'bad', reason: 'order_cancelled', retry: true });
  });

  it('keeps one line per message, in the order the API sent them', () => {
    const lines = tellLines([m({ kind: 'dispatch', state: 'accepted', at: 'x' }), m({ kind: 'cancel' })]);
    expect(lines.map((l) => l.kind)).toEqual(['dispatch', 'cancel']);
  });
});

describe('the screen', () => {
  it('is drawn for a marketplace order only, under the state, and asking again is offered only when the API says this viewer may', () => {
    expect(screen).toContain('!isCounter ? (');
    expect(screen).toContain('canRetry={order.canRetryMarketplace === true}');
    expect(line).toContain('l.retry && canRetry &&');
  });

  it('a busy retry keeps focus (aria-disabled, not disabled), is one at a time, and is announced from one live region', () => {
    expect(line).toContain('aria-disabled={busy}');
    expect(line).not.toMatch(/(?<![-\w])disabled=\{/);
    expect(line).toContain('inFlight.current');
    expect(line).toContain('role="status" aria-live="polite"');
  });

  it('says why a marketplace refused in our words, from the closed set, never the marketplace’s own', () => {
    expect(line).toContain("t(`tell.refused.${l.reason ?? 'other'}`");
    for (const r of ['order_cancelled', 'order_unknown', 'not_allowed', 'other']) expect(Object.keys(messages('en').tell.refused as object)).toContain(r);
  });

  it('prints the time in the shop’s zone and the reader’s language, and the list marks an order not yet confirmed, in words', () => {
    expect(line).toContain('timeZone: timezone');
    expect(line).toContain('intlLocale(locale)');
    expect(list.match(/r\.marketplaceUnconfirmed \? <span className="ord-unconfirmed">\{t\('list\.notConfirmed'\)\}<\/span> : null/g)).toHaveLength(2);
  });

  it('is a thumb tall where it is tapped, wraps rather than scrolls, and has no icon, emoji or animation', () => {
    expect(css).toMatch(/\.ord-tell-btn \{[^}]*min-height: 2\.75rem/);
    expect(css).toMatch(/\.ord-tell-row \{[^}]*flex-wrap: wrap/);
    const block = css.slice(css.indexOf('.ord-tell {'));
    expect(block).not.toMatch(/font-size:\s*\d+px|animation|transition/);
    expect(line).not.toMatch(/<svg|[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe('a waiting message does not leave the line stale', () => {
  it('reads the order again every few seconds, a bounded number of times, while a message waits; and says "asked again" instead of inviting another tap', () => {
    expect(line).toContain('const POLL_EVERY_MS = 8_000');
    expect(line).toContain('const POLL_LIMIT = 8');
    expect(line).toContain('setInterval(');
    expect(line).toContain('clearInterval(id)');
    expect(line).toContain("asked ? t('tell.asked', { channel })");
    expect(line).toContain("!(asked && l.key === 'pending')");
  });
});

describe('the list chip fits at 344px', () => {
  it('the card foot wraps, so the code, the state and "Not confirmed" never squeeze into one line', () => {
    expect(css).toMatch(/\.ord-card-foot \{[^}]*flex-wrap: wrap/);
    expect(css).toMatch(/\.ord-unconfirmed \{[^}]*margin-inline-start/);
  });
});

describe('every sentence has a Hindi twin, with the same placeholders', () => {
  const flat = (o: Record<string, unknown>, p = ''): Array<[string, string]> => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${p}${k}`, v] as [string, string]] : flat(v as Record<string, unknown>, `${p}${k}.`)));
  const en = flat(messages('en').tell);
  const hi = new Map(flat(messages('hi').tell));
  it('there are some to check', () => expect(en.length).toBe(14));
  it.each(en)('%s', (id, text) => {
    const h = hi.get(id);
    expect(h, `hi.json is missing orders.tell.${id}`).toBeTruthy();
    const holes = (s: string) => [...s.matchAll(/\{(\w+)[,}]/g)].map((x) => x[1]).sort();
    expect(holes(h!)).toEqual(holes(text));
    expect(h).not.toBe(text);
  });
  it('the list chip has one', () => {
    expect(messages('en').list.notConfirmed).toBe('Not confirmed');
    expect(messages('hi').list.notConfirmed).toBeTruthy();
  });
});
