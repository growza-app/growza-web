import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBuffer, stockLine } from '../../lib/channel-keys-state';
import type { ChannelConnection } from '../../lib/api-types';

/**
 * Jira GRW-624 — stock going out to a marketplace, on Settings › Online selling, pinned at the source.
 *
 * What was checked in a browser at 344px is in the PR. These keep the rules that must not drift: the line says what is true in the order
 * an owner needs it, the screen holds counts and times and never a number per size, the buffer is a whole number typed on a numeric
 * keypad, and every sentence has a Hindi twin.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const stock = here('./ChannelStock.tsx');
const keys = here('./ChannelKeys.tsx');
const types = readFileSync(path.resolve(import.meta.dirname, '../../lib/api-types.ts'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).settingsChannels as Record<string, string>;

const base = (over: Partial<ChannelConnection['stock']> = {}, conn: Partial<Pick<ChannelConnection, 'saved' | 'canCheck'>> = {}) => ({
  saved: true,
  canCheck: true,
  stock: { channel: 'flipkart' as const, buffer: 1, lastPushedAt: null, lastRunReason: null, waiting: 0, stuck: 0, ...over },
  ...conn,
});

describe('the line under the keys says what is true, in the order an owner needs it', () => {
  it('says nothing until keys are saved: there is nowhere for stock to go', () => {
    expect(stockLine(base({}, { saved: false }))).toEqual({ primary: null, stuck: 0 });
  });

  it('says stock goes once the marketplace is connected while no adapter exists — never "last updated", never "waiting"', () => {
    expect(stockLine(base({ waiting: 40, lastPushedAt: '2026-10-21T10:05:00Z' }, { canCheck: false })).primary).toMatchObject({ key: 'notYet' });
  });

  it('a refusal of the keys outranks everything: nothing will go until they are replaced', () => {
    expect(stockLine(base({ lastRunReason: 'refused', lastPushedAt: '2026-10-21T10:05:00Z', waiting: 3 })).primary).toMatchObject({ key: 'refused', tone: 'bad' });
  });

  it.each([
    ['keys_unreadable', 'unreadable', 'bad'],
    ['unreachable', 'unreachable', 'bad'],
    ['rate_limited', 'slow', 'idle'],
  ] as const)('a last run that ended on %s reads %s', (reason, key, tone) => {
    expect(stockLine(base({ lastRunReason: reason, lastPushedAt: '2026-10-21T10:05:00Z' })).primary).toMatchObject({ key, tone });
  });

  it('otherwise it says when stock last went, else how many wait, else that nothing has gone', () => {
    expect(stockLine(base({ lastPushedAt: '2026-10-21T10:05:00Z' })).primary).toEqual({ key: 'updated', tone: 'ok', at: '2026-10-21T10:05:00Z' });
    expect(stockLine(base({ waiting: 12 })).primary).toEqual({ key: 'waiting', tone: 'idle', count: 12 });
    expect(stockLine(base()).primary).toEqual({ key: 'nothing', tone: 'idle' });
  });

  it('sizes that failed past the cap are a separate count, true whatever the last run said', () => {
    expect(stockLine(base({ stuck: 3, lastPushedAt: '2026-10-21T10:05:00Z' })).stuck).toBe(3);
    expect(stockLine(base({ stuck: 2 }, { canCheck: false })).stuck).toBe(2);
  });
});

describe('the buffer is a whole number from 0 to 1000', () => {
  it.each([['0', 0], ['1', 1], [' 12 ', 12], ['1000', 1000], ['0007', 7]])('reads %j as %d', (text, n) => {
    expect(parseBuffer(text)).toBe(n);
  });
  it.each([[''], [' '], ['-1'], ['1.5'], ['1001'], ['10000'], ['abc'], ['1e3'], ['١٢']])('refuses %j', (text) => {
    expect(parseBuffer(text)).toBeNull();
  });
});

describe('the screen', () => {
  it('holds counts and times only: the type has no per-size field', () => {
    const block = types.slice(types.indexOf('export interface ChannelStock {'), types.indexOf('/** Jira GRW-623 — one marketplace'));
    expect(block).toContain('buffer: number');
    expect(block).toContain('waiting: number');
    expect(block).toContain('stuck: number');
    expect(block).not.toMatch(/\bcodes?\b|\bsizes?:|\bavailable\b|\bvariant/i);
  });

  it('lets our own check speak, in either language: no native `pattern` bubble (English only, "match the format requested")', () => {
    expect(stock).toContain('noValidate');
    expect(stock).not.toContain('pattern=');
  });

  it('types the buffer on a numeric keypad, in 16px type through the shared input class, with its hint tied to it', () => {
    expect(stock).toContain('inputMode="numeric"');
    expect(stock).toContain('className="input stc-input"');
    expect(stock).toContain('aria-describedby={`stc-buffer-hint-${conn.channel}`}');
    expect(stock).toMatch(/<label className="stc-label" htmlFor=\{`stc-buffer-\$\{conn\.channel\}`\}>/);
  });

  it('shows Save only when the number changed, and never sends one the browser can already tell is wrong', () => {
    expect(stock).toContain('const changed = parseBuffer(draft) !== conn.stock.buffer');
    expect(stock).toMatch(/\{changed \? \(/);
    expect(stock).toContain('parseBuffer(draft)');
    expect(stock).toContain("setProblem('invalid')");
  });

  it('a busy Save keeps focus (aria-disabled, not disabled), and the answer is announced from one live region', () => {
    expect(stock).toContain('aria-disabled={busy}');
    expect(stock).not.toMatch(/(?<![-\w])disabled=\{/);
    expect(stock).toContain('role="status" aria-live="polite"');
  });

  it('a read-only role sees the number and no field', () => {
    expect(stock).toContain('writable ? (');
    expect(stock).toContain("t('bufferReadOnly'");
  });

  it('sits under the keys and stays mounted while their form is open, so a number typed and not saved is not thrown away; reloads after a save', () => {
    expect(keys).toContain('<ChannelStock key={conn.channel} conn={conn} name={name} onChanged={() => load(true)} />');
    expect(keys).not.toContain('{!open ? <ChannelStock');
  });

  it('follows the server: the field is re-set from what is saved, and "01" over a saved 1 is not a change', () => {
    expect(stock).toContain('useEffect(() => setDraft(String(conn.stock.buffer)), [conn.stock.buffer]);');
    expect(stock).toContain('setDraft(String(n));');
  });

  it('calls only the server’s 400 "not a number in range"; a refused role or a dropped session is a failed save, not a wrong number', () => {
    expect(stock).toContain("e instanceof ApiError && e.status === 400 ? 'invalid' : 'failed'");
  });

  it('a business with several shops that has not said which one sells here is told in our words, pointing at the row above', () => {
    expect(keys).toContain("e.code === 'no_branch'");
    expect(keys).toContain("setProblem({ id: 'noBranch' })");
    expect(keys).toContain("t('keysNoBranch', { channel: name })");
  });

  it('a save of the keys keeps the shop and the stock line it was showing, and reads them again', () => {
    expect(keys).toContain('branch: conn.branch, stock: conn.stock });');
    expect(keys).toMatch(/branch: conn\.branch, stock: conn\.stock \}\);\s*load\(true\);/);
  });

  it('puts no icon, emoji or animation in it', () => {
    expect(stock).not.toMatch(/<svg|[\u{1F300}-\u{1FAFF}]/u);
    expect(stock).not.toMatch(/animation|transition/);
  });
});

describe('every sentence has a Hindi twin, with the same placeholders', () => {
  const ids = Object.keys(messages('en')).filter((k) => /^(stock|buffer)/.test(k) || k === 'keysNoBranch');
  it('there are some to check', () => expect(ids.length).toBeGreaterThanOrEqual(19));
  it.each(ids)('%s', (id) => {
    const en = messages('en')[id]!;
    const hi = messages('hi')[id];
    expect(hi, `hi.json is missing ${id}`).toBeTruthy();
    const holes = (s: string) => [...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort();
    expect(holes(hi!)).toEqual(holes(en));
    expect(hi).not.toBe(en);
  });
});
