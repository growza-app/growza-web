import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-632 — what sells and what sits, pinned at the source.
 *
 * What was checked in a browser at 344px is in the PR. These keep the rules that must not drift: both views are one page from the
 * server with the server's totals, last year is absent rather than zero, a missing cost is said, the owner's screen is not the desk's,
 * and the words are in both languages.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./SellersClient.tsx');
const page = here('./page.tsx');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).products.sellers as Record<string, unknown>;

describe('two views behind one chip row, each a page from the server', () => {
  it('asks the server for one page of rows, with the filters, and takes the totals from it', () => {
    expect(client).toContain('api.bestSellers(q)');
    expect(client).toContain('api.deadStock(q)');
    expect(client).toContain('<Pagination page={livePage} total={best.totals.sizes}');
    expect(client).toContain('<Pagination page={livePage} total={dead.totals.sizes}');
    expect(client).not.toMatch(/\.reduce\(|\.sort\(/);
  });

  it('a change of branch, view or period starts the page over in the same render — one read', () => {
    expect(client).toContain('const stale = scope !== scopeNow;');
    expect(client).toContain('const livePage = stale ? 1 : page;');
  });
});

describe('last year, and what is missing', () => {
  it('shows last year only where the shop has data for it, and says nothing where it has none — never a zero or a percentage', () => {
    expect(client).toContain('best.lastYear.hasData && r.lastYearUnits !== null');
    // Reports UX check 2026-11-28 (#9) — "no sales last year" on every visit of a first-year shop was noise.
    expect(client).not.toContain("t('noLastYear')");
    expect(client).not.toMatch(/%/);
  });

  it('a size with no cost price is said to have none, and a shelf with none anywhere is not "worth ₹0"', () => {
    expect(client).toContain("t('withoutCost'");
    expect(client).toContain("dead.totals.sizesWithoutCost >= dead.totals.sizes ? t('noCost')");
  });

  it('two different, plain empty lines — nothing sold, nothing sitting', () => {
    expect(client).toContain("t('noSales')");
    expect(client).toContain("t('nothingSits')");
  });
});

describe('who sees it', () => {
  it('is guarded at its own address: who may open it is reports-tabs-follow-role.test.ts (Jira GRW-754)', () => {
    expect(page).toContain("await guardScreen('/stock/sellers');");
  });
});

describe('the words, in both languages', () => {
  it('every word the screen uses exists in English and Hindi', () => {
    const used = new Set([...client.matchAll(/\bt\('([A-Za-z]+)'/g)].map((m) => m[1]!));
    for (const lang of ['en', 'hi'] as const) {
      const have = messages(lang);
      for (const key of used) expect(have[key], `${lang}.${key}`).toBeTruthy();
      for (const r of ['last_7_days', 'this_month', 'last_month', 'last_3_months', 'this_year']) expect((have.range as Record<string, string>)[r], `${lang}.range.${r}`).toBeTruthy();
    }
    expect(Object.keys(messages('hi')).sort()).toEqual(Object.keys(messages('en')).sort());
  });
});
