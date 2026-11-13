import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Owner's review 2026-11-13 — the reorder list (`/stock/order`) had four doors: Home's Needs attention card, the
 * Reports tab row (fifth tab, off-screen on a phone), and a button on the stock report and on Top sellers. None of
 * them was the shelf, which is where you notice you are short. The Stock screen now has it: beside Stock report in
 * the header on a desk, and in a two-link row under the four figures on a phone. Each door is drawn exactly once
 * per width, only on a counted shelf (a kitchen has no reorder list — `/stock/order` is a COUNT_ROUTE), and only
 * for a role that may read a report.
 */
const list = readFileSync(new URL('./ProductsList.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/96-products.css', import.meta.url), 'utf8');

describe('the reorder list is a door on the Stock screen', () => {
  it('sits beside Stock report in the header on a desk, under the same gate', () => {
    const stockReport = list.indexOf('<Link className="btn btn-ghost desktop-only" href="/stock/report">');
    const reorder = list.indexOf('<Link className="btn btn-ghost desktop-only" href="/stock/order">');
    expect(stockReport).toBeGreaterThan(-1);
    expect(reorder).toBeGreaterThan(stockReport);
    const gate = 'heading !== undefined && canStockTake && counted ? (';
    expect(list.slice(reorder - 160, reorder)).toContain(gate);
    expect(list.slice(reorder, reorder + 160)).toContain("{t('reorder.title')}");
  });

  it('is a phone-only row under the figures, drawn in both the desk and the phone layout', () => {
    expect(list).toContain('<nav className="prd-report-links mobile-only"');
    expect(list).toContain('<Link className="prd-report-link" href="/stock/report">');
    expect(list).toContain('<Link className="prd-report-link" href="/stock/order">');
    expect(list.match(/\{reportLinks\}/g)).toHaveLength(2);
    expect(list).toMatch(/\{strip\}\n\s*\{reportLinks\}/);
    // The row is gated exactly as the header buttons are: counted shelf, Stock's own heading, a reporting role.
    const row = list.indexOf('const reportLinks =');
    expect(list.slice(row, row + 120)).toContain('heading !== undefined && canStockTake && counted ? (');
  });

  it('is a 44px tap target in the accent, hidden where the header carries the same buttons', () => {
    expect(css).toMatch(/\.prd-report-link \{[^}]*min-height: 2\.75rem;/);
    expect(css).toMatch(/\.prd-report-link \{[^}]*color: var\(--accent-deep\);/);
    expect(css).toMatch(/\.prd-report-links \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    // 96-products.css loads after the shared `.mobile-only` rule, so its own `display: grid` would win at ≥861px
    // by source order; the sheet hides the row itself in the same desktop query.
    expect(css).toMatch(/@media \(min-width: 861px\) \{\s*\.prd-report-links \{\s*display: none;/);
  });
});
