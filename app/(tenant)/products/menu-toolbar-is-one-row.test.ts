import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Owner, 2026-10-28 — "instead of this big button, better to have filter option".
 *
 * Three full-width controls wrapped to two rows below 380px, so at 375px the first dish began 426px down an 812px
 * screen. The fix is shape, not words: the one control with nothing to show becomes its icon, and the two that
 * carry a VALUE keep a readable half of the row each.
 *
 * These assert the shape, because the cheap way to make a toolbar fit is to shrink the type or drop a word, and
 * both are things this product cannot afford — its owners may not read English confidently.
 */
const css = readFileSync(join(process.cwd(), 'app/(tenant)/styles/96-products.css'), 'utf8');
const list = readFileSync(join(process.cwd(), 'app/(tenant)/products/ProductsList.tsx'), 'utf8');

describe('the Menu toolbar is one row on every phone', () => {
  it('gives the two value controls a half each and the third exactly a touch target', () => {
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 2.75rem;');
  });

  it('has no narrow-phone fallback that wraps it to two rows again', () => {
    // The 380px block that used to drop `.prd-selects` back to two columns is gone. (There is still a 380px
    // block in this file for an edit form's fields — a broader assertion than this one caught that instead.)
    const narrow = css.match(/@media \(max-width: 380px\) \{[\s\S]*?\n\s*\}\n\s*\}/g) ?? [];
    for (const block of narrow) expect(block).not.toContain('.prd-selects');
    expect(css).not.toMatch(/\.prd-selects \{\s*grid-template-columns: 1fr 1fr;\s*\}/);
  });

  it('keeps the name of the control it drew as an icon, so it is still announced', () => {
    expect(list).toContain("aria-label={t('bulkTable.open')}");
    expect(list).toContain('prd-bulk-edit-word');
    expect(list).toContain('prd-bulk-edit-icon');
  });

  it('shows the words where there is room for them: the icon is phone-only', () => {
    // Base rule hides it; the phone block turns it on. The desktop toolbar never had one.
    expect(css).toMatch(/\.prd-bulk-edit-icon \{\s*display: none;/);
    expect(css).toMatch(/\.prd-bulk-edit-icon \{\s*display: inline-flex;/);
  });

  it('does not buy the row back by shrinking type below the floor', () => {
    // 0.875rem = 14px, over the 12px floor accessibility.test.ts holds every screen to.
    expect(css).toContain('font-size: 0.875rem;');
    expect(css).not.toContain('font-size: 0.6875rem');
  });
});

describe('the overview strip drops the lines that were not pulling their weight', () => {
  it('hides the three that restate their label or cut themselves off', () => {
    expect(css).toMatch(/\.prd-stat-products \.prd-stat-sub,\s*\.prd-stat-cats \.prd-stat-sub,\s*\.prd-stat-retired \.prd-stat-sub \{\s*display: none;/);
  });

  it('keeps the top seller’s, which is the one saying something its number does not', () => {
    expect(css).not.toContain('.prd-stat-worth .prd-stat-sub');
  });

  it('names the retired card, because a rule cannot reach a card with no name', () => {
    expect(list).toContain('prd-stat prd-stat-tap prd-stat-retired');
  });
});
