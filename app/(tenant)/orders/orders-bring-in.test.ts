import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bringInLine } from '../lib/channel-keys-state';

/**
 * Jira GRW-623 — the one line the Orders screen says about orders coming in from a marketplace, pinned at the source.
 *
 * What was checked in a browser at 344px is in the PR. These keep the rules that must not drift: nothing is said for a marketplace nothing
 * is asking yet, a problem outranks the news, the owner and manager alone are shown it, a failed read does not fail the screen, and every
 * sentence has a Hindi twin.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const screen = here('./OrdersScreen.tsx');
const line = here('./OrdersBringIn.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../styles/99-orders.css'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../messages', `${lang}.json`), 'utf8')).orders.bringIn as Record<string, string>;

const ok = { canPull: true, keysRejected: false, lastBroughtInAt: '2026-10-21T04:10:00Z', lastRunReason: null } as const;

describe('what the line says', () => {
  it('says nothing for a marketplace whose adapter does not exist: a line about something nothing is asking would be a lie', () => {
    expect(bringInLine({ ...ok, canPull: false })).toBeNull();
    expect(bringInLine({ canPull: false, keysRejected: true, lastBroughtInAt: null, lastRunReason: 'refused' })).toBeNull();
  });

  it('says when orders last came in, or that none have', () => {
    expect(bringInLine(ok)).toEqual({ key: 'updated', tone: 'ok' });
    expect(bringInLine({ ...ok, lastBroughtInAt: null })).toEqual({ key: 'nothing', tone: 'idle' });
  });

  it('keys the marketplace turned down at Check read as refused, whatever the last run said — and never as a green "last brought in"', () => {
    expect(bringInLine({ ...ok, keysRejected: true })).toEqual({ key: 'refused', tone: 'bad' });
    expect(bringInLine({ ...ok, keysRejected: true, lastRunReason: 'rate_limited' })).toEqual({ key: 'refused', tone: 'bad' });
  });

  it('says how many orders could not be read and how many the marketplace has not been told about, beside the main line', () => {
    expect(line).toContain("l.lastMalformed > 0 ?");
    expect(line).toContain("t('bringIn.malformed'");
    expect(line).toContain("l.unacknowledged > 0 ?");
    expect(line).toContain("t('bringIn.unacknowledged'");
  });

  it.each([
    ['refused', 'refused', 'bad'],
    ['keys_unreadable', 'unreadable', 'bad'],
    ['unreachable', 'unreachable', 'bad'],
    ['failed', 'unreachable', 'bad'],
    ['rate_limited', 'slow', 'idle'],
  ] as const)('a last run that ended on %s outranks the news and reads %s', (reason, key, tone) => {
    expect(bringInLine({ ...ok, lastRunReason: reason })).toEqual({ key, tone });
  });
});

describe('the screen', () => {
  it('shows it to the owner and manager only, as the API does, and a failed read says nothing rather than failing the page', () => {
    expect(screen).toContain('mayReadReturns ? await api.channelOrdersStatus().then((r) => r.channels).catch(() => []) : []');
    expect(screen).toContain('<OrdersBringIn lines={bringIn}');
  });

  it('is a server component with no state, and says nothing at all when there is nothing to say', () => {
    expect(line).not.toContain("'use client'");
    expect(line).not.toMatch(/useState|useEffect/);
    expect(line).toContain('if (shown.length === 0) return null;');
  });

  it('prints the time in the shop’s own zone and the reader’s language', () => {
    expect(line).toContain('timeZone: timezone');
    expect(line).toContain("lang === 'hi' ? 'hi-IN' : 'en-IN'");
  });

  it('links to the orders waiting for a size, a thumb tall, and wraps rather than scrolls', () => {
    expect(line).toContain('href="/orders/held"');
    expect(css).toMatch(/\.ord-bringin-link \{[^}]*min-height: 2\.75rem/);
    expect(css).toMatch(/\.ord-bringin-row \{[^}]*flex-wrap: wrap/);
    expect(css).toMatch(/\.ord-bringin-row \{[^}]*overflow-wrap: anywhere/);
  });

  it('uses the type and colour tokens, no pixel type, no icon, no animation', () => {
    const block = css.slice(css.indexOf('.ord-bringin {'));
    expect(block).not.toMatch(/font-size:\s*\d+px/);
    expect(block).not.toMatch(/animation|transition/);
    expect(line).not.toMatch(/<svg|[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe('every sentence has a Hindi twin, with the same placeholders', () => {
  const ids = Object.keys(messages('en'));
  it('there are some to check', () => expect(ids.length).toBe(11));
  it.each(ids)('%s', (id) => {
    const en = messages('en')[id]!;
    const hi = messages('hi')[id];
    expect(hi, `hi.json is missing ${id}`).toBeTruthy();
    const holes = (s: string) => [...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort();
    expect(holes(hi!)).toEqual(holes(en));
    expect(hi).not.toBe(en);
  });
});
