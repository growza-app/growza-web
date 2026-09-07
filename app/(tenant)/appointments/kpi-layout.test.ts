import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-10 — the KPI row's middle-width arrangement.
 *
 * The grid is `repeat(4, 1fr) 1.6fr`. Between the 861px breakpoint and about
 * 1150px that fifth cell is too narrow for the metric card, and the row
 * overflowed its container by 75px at 861, 32px at 1024 and 12px at 1100 —
 * FR-02 asks for no overflow "at 1024px or below", so it was failing at the
 * width the story names.
 *
 * There is no browser harness in this repo, so nothing can re-measure that
 * overflow on CI. This asserts the rule that fixes it still exists and still
 * covers the range it was measured against — which is the part a later edit
 * would remove without noticing.
 */
const css = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../styles/32-customers.css'),
  'utf-8',
);

describe('the KPI row between 861px and five-across', () => {
  const block = css.slice(css.indexOf('@media (min-width: 861px) and (max-width: 1149px)'));

  it('has a rule for the range where five columns do not fit', () => {
    expect(css).toContain('@media (min-width: 861px) and (max-width: 1149px)');
  });

  it('drops the grid to four columns there', () => {
    expect(block.slice(0, 400)).toMatch(/\.bk-kpis\s*\{[^}]*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  });

  it('gives the metric card its own full-width row, as the phone layout does', () => {
    expect(block.slice(0, 600)).toMatch(/\.bk-metric-card\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
  });

  it('leaves the five-across grid as the default for wider screens', () => {
    // The base rule is what the desktop mock draws; this story narrowed WHEN it
    // applies, and must not have changed WHAT it is.
    expect(css).toMatch(/^\.bk-kpis\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)\s*1\.6fr/m);
  });
});
