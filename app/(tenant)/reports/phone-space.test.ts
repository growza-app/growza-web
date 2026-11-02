import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/**
 * Owner, 2026-11-02 — on a phone the first figure on Reports sat 319px down an 812px screen. Nothing below the
 * takings card was on screen. None of this was content: it was spacing applied twice and two boxes drawn around
 * things that already had their own.
 */
describe('Reports on a phone spends its height on figures', () => {
  const stock = read('styles/99-stock-report.css');
  const counter = read('styles/99-counter-report.css');

  it('a page-body column is spaced by its gap alone, never gap plus margin', () => {
    // 92-spacing.css gives every child of a .page-body a 16px top margin on a phone; here the gap does that job,
    // because a margin is applied in DOM order and this page reorders itself.
    expect(stock).toMatch(/@media \(max-width: 860px\) \{[^@]*\.srp-page \{\s*gap: var\(--sp-4\);/);
    expect(stock).toMatch(/\.page-body\.srp-page:not\(\.hm-page\)[^{]*\{\s*margin-top: 0 !important;/);
    // Desktop keeps the column's own gap, where the spacing rule does not apply.
    expect(stock).toMatch(/\.srp-page \{[^}]*gap: var\(--sp-3\);/);
  });

  it('a phone reads the report first and the other reports after it', () => {
    expect(counter).toMatch(/@media \(max-width: 860px\) \{\s*\.srp-page > \.cr \{\s*order: -1;/);
    // `order` and not a change of markup: the order a screen reader follows is the one it always had.
    expect(read('reports/page.tsx')).toMatch(/<h2 className="cr-more">[\s\S]{0,40}<\/h2>\s*<RetailReportsNav/);
    expect(counter).toMatch(/\.cr-more \{\s*position: absolute;/);
    expect(counter).toMatch(/\.cr-toolbar \{\s*justify-content: flex-start;/);
  });

  it('the report chips are not boxed twice — each chip already carries its own border', () => {
    expect(counter).toMatch(/\.srp-nav-links \{\s*padding: 0;\s*border: 0;[^}]*background: none;/);
  });

  it("a shop's header links are not repeated where the bottom bar already has them", () => {
    expect(read('reports/page.tsx')).toContain('className="btn btn-ghost cr-head-link"');
    expect(counter).toMatch(/@media \(max-width: 640px\) \{\s*\.cr-head-link \{\s*display: none;/);
  });
});
