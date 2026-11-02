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

  it('a page-body column does not pay for its gap twice', () => {
    // 92-spacing.css already gives every child of a .page-body a 16px top margin on a phone.
    expect(stock).toMatch(/@media \(max-width: 860px\) \{\s*\.srp-page \{\s*gap: 0;/);
    // Desktop keeps the column's own gap, where the spacing rule does not apply.
    expect(stock).toMatch(/\.srp-page \{[^}]*gap: var\(--sp-3\);/);
  });

  it('the report chips are not boxed twice — each chip already carries its own border', () => {
    expect(counter).toMatch(/\.srp-nav-links \{\s*padding: 0;\s*border: 0;[^}]*background: none;/);
  });

  it("a shop's header links are not repeated where the bottom bar already has them", () => {
    expect(read('reports/page.tsx')).toContain('className="btn btn-ghost cr-head-link"');
    expect(counter).toMatch(/@media \(max-width: 640px\) \{\s*\.cr-head-link \{\s*display: none;/);
  });
});
