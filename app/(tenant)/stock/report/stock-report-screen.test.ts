import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-631 — the stock report, pinned at the source.
 *
 * What was checked in a browser at 344px is in the PR. These keep the rules that must not drift: the screen and the file are one
 * answer, a missing cost is said and never invented, a negative count is shown as it is, the owner's screen is not the desk's,
 * and the words are in both languages.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./StockReportClient.tsx');
const page = here('./page.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../../styles/99-stock-report.css'), 'utf8');
const api = readFileSync(path.resolve(import.meta.dirname, '../../lib/api.ts'), 'utf8');
const list = readFileSync(path.resolve(import.meta.dirname, '../../products/ProductsList.tsx'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).products.stockReport as Record<string, string>;

describe('one answer, on the screen and in the file (BR-04)', () => {
  it('reads one page of styles at a time from the server, with the totals the server worked out over all of them', () => {
    expect(client).toContain('api.stockReport({ location: branch || undefined, categoryId: liveCategory || undefined, q, page: livePage, pageSize: PAGE_SIZE })');
    expect(client).toContain('<Pagination page={livePage} total={data.totals.styles}');
    expect(client).not.toMatch(/\.reduce\(/);
  });

  it('the file is the server’s own, made with the same filters — not built from the page in hand', () => {
    expect(client).toContain('api.stockReportCsv({ location: branch || undefined, categoryId: liveCategory || undefined, q })');
    expect(api).toContain('/api/v1/reports/stock/export?');
    expect(api).toContain('/api/v1/reports/stock?');
  });

  it('a double tap on Export makes one file', () => {
    expect(client).toContain('if (exportBusy.current) return;');
    expect(client).toContain('disabled={exporting}');
  });
});

describe('what is missing is said, what is below zero is shown (AC-02, AC-03)', () => {
  it('says how many sizes are left out of the worth for want of a cost price, per style and in total, and never shows a worth for a style with none', () => {
    expect(client).toContain("t('withoutCost'");
    // A shelf with no cost price anywhere is not "worth ₹0".
    expect(client).toContain("totals.sizesWithCost === 0 ? t('noCost')");
    expect(client).toContain("style.valueMinor === null ? t('noCost') : money(style.valueMinor)");
    expect(client).toContain("t('noCostShort')");
  });

  it('shows a count below zero as the number it is, and says how many there are', () => {
    expect(client).toContain('count(z.stock)');
    expect(client).toContain("t('negative'");
    expect(css).toContain('.srp-size-negative');
  });

  it('a shelf nobody has counted says so rather than listing zeros', () => {
    expect(client).toContain('data.totals.styles === 0 || data.neverCounted');
    expect(client).toContain("t('neverCounted')");
  });
});

describe('who sees it, and where', () => {
  it('the front desk is sent back to Stock, as the API refuses it', () => {
    expect(page).toContain("role === undefined || role === 'owner' || role === 'manager'");
    expect(page).toContain("redirect('/stock')");
  });

  it('is offered from the shop’s Stock screen only, to the owner and manager', () => {
    expect(list).toContain('heading !== undefined && canStockTake');
    expect(list).toContain('href="/stock/report"');
  });

  it('follows the header’s branch picker rather than keeping a second one, and offers categories only when one branch is in view', () => {
    expect(client).toContain('useBranch()');
    expect(client).not.toContain('pf-chips');
    expect(client).toMatch(/\.productCategories\(oneBranch\)/);
  });
});

describe('laid out for a thumb at 344px', () => {
  it('every control is 44px tall and type is in rem', () => {
    expect(css).toContain('min-height: 2.75rem');
    expect(css).not.toMatch(/font-size:\s*\d+px(?!;)/);
    // Only the 16px that stops iOS zooming a field on focus (the filter selects, and the reorder worklist's number fields).
    expect((css.match(/font-size:\s*\d+px/g) ?? []).every((x) => x === 'font-size: 16px')).toBe(true);
  });

  it('the sizes wrap, never scroll sideways', () => {
    expect(css).toMatch(/\.srp-sizes\s*\{[^}]*flex-wrap: wrap/);
    expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });

  it('renders the 4-card KPI strip, quick filter pills, Cards/Table view toggle, and top-aligned style cards', () => {
    expect(client).toContain('srp-totals srp-kpi-grid');
    expect(client).toContain('srp-filter-pills');
    expect(client).toContain('srp-view-toggle');
    expect(client).toContain('srp-table-card');
    expect(css).toContain('.srp-card {\n  display: flex;\n  flex-direction: column;\n  justify-content: flex-start;');
    expect(css).toContain('.srp-value.is-no-cost');
  });
});

describe('the words, in both languages', () => {
  it('every word the screen uses exists in English and Hindi', () => {
    const used = new Set([...client.matchAll(/\bt\('([A-Za-z]+)'/g)].map((m) => m[1]!));
    for (const lang of ['en', 'hi'] as const) {
      const have = messages(lang);
      for (const key of used) expect(have[key], `${lang}.${key}`).toBeTruthy();
    }
    expect(Object.keys(messages('hi')).sort()).toEqual(Object.keys(messages('en')).sort());
  });
});
