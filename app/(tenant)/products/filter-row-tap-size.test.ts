import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** QA 13 Nov 2026, bug 3 — the phone's filter scroller on /stock was all 36px controls; below 861px they are 44px. */
const css = readFileSync(new URL('../styles/96-products.css', import.meta.url), 'utf8');

describe('the shelf’s filter row is a 44px tap target on a phone', () => {
  it('lifts the chips, Categories, the sort and Bulk edit to 2.75rem below 861px', () => {
    expect(css).toMatch(
      /@media \(max-width: 860px\) \{\s*\.prd-filter-row \.prd-chip,\s*\.prd-filter-row \.sls-dd-btn,\s*\.prd-filter-row \.prd-sort select \{\s*min-height: 2\.75rem;/,
    );
  });
});
