import { beforeEach, describe, expect, it } from 'vitest';
import { clearReportCache, fetchOnce, FRESH_PAST_MS, FRESH_TODAY_MS, freshFor, isFresh, MAX_ENTRIES, peek } from './report-cache';

/** Owner, 2026-11-24 — Reports keeps what it read in memory: no request to go back to a tab, one for two quick taps. */
beforeEach(() => clearReportCache());

describe('the browser keeps a report in memory', () => {
  it('two taps on the same tab make one request', async () => {
    let calls = 0;
    const load = () => new Promise<number>((r) => setTimeout(() => r(++calls), 5));
    const [a, b] = await Promise.all([fetchOnce('k', load), fetchOnce('k', load)]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
  });

  it('what came back is kept for the key, and only for it', async () => {
    await fetchOnce('owner|sales|2026-11-18|2026-11-24|', async () => ({ moneyIn: 1 }));
    expect(peek('owner|sales|2026-11-18|2026-11-24|')?.value).toEqual({ moneyIn: 1 });
    expect(peek('manager|sales|2026-11-18|2026-11-24|')).toBeUndefined();
  });

  it('a failed read keeps nothing', async () => {
    await expect(fetchOnce('k', async () => { throw new Error('down'); })).rejects.toThrow('down');
    expect(peek('k')).toBeUndefined();
  });

  it('fresh for a minute with today in the dates, ten minutes for days that are over', () => {
    expect(freshFor('2026-11-24', '2026-11-24')).toBe(FRESH_TODAY_MS);
    expect(freshFor('2026-11-20', '2026-11-24')).toBe(FRESH_PAST_MS);
    expect(isFresh({ at: 0 }, FRESH_TODAY_MS, 59_000)).toBe(true);
    expect(isFresh({ at: 0 }, FRESH_TODAY_MS, 61_000)).toBe(false);
  });

  it(`keeps at most ${MAX_ENTRIES}, dropping the one used longest ago`, async () => {
    for (let i = 0; i < MAX_ENTRIES; i++) await fetchOnce(`k${i}`, async () => i);
    peek('k0');
    await fetchOnce('new', async () => 'n');
    expect(peek('k0')).toBeDefined();
    expect(peek('k1')).toBeUndefined();
  });

  it('never touches localStorage or sessionStorage', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./report-cache.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});
