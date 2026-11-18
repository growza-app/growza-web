import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Review of the overnight stack (item 16) — the regrouped hub scrolled for a restaurant owner by 18px at 393×852, 26px at
 * 390×844, and the desktop list by 11px at 1366×680. Measured in a real browser after this rule: 0px at all three, and at
 * 344×882, with every row still 44px. (settings-fit.test.ts, which drives a browser, is not in this repo's vitest run.)
 * This guards the rule's shape: tokens only, the last word in the sheet, and nothing that touches a row's height.
 */
const css = readFileSync(resolve(__dirname, '../styles/85-settings-fit.css'), 'utf8');
const block = css.slice(css.indexOf('Review of the overnight stack (item 16)'));

describe('the hub fits a shorter phone and a short laptop', () => {
  it('is the last rule in the sheet, so the GRW-229 bands above it cannot undo it', () => {
    expect(css.indexOf('Review of the overnight stack (item 16)')).toBeGreaterThan(css.lastIndexOf('.bp-form-branch'));
  });

  it('spends only tokens: the page padding, the header padding and the heading line box', () => {
    expect(block).toMatch(/@media \(max-width: 860px\) and \(max-height: 880px\)/);
    expect(block).toMatch(/padding-top: var\(--sp-1\) !important;/);
    expect(block).toMatch(/\.content-main:has\(> \.page-body > \.settings-hub\) > \.topbar \{\s*padding-top: var\(--sp-2\);\s*padding-bottom: var\(--sp-2\);/);
    expect(block).toMatch(/\.settings-hub \.settings-group-title \{\s*line-height: 1;/);
    expect(block).toMatch(/@media \(min-width: 861px\) and \(max-height: 740px\)/);
    // No one-off pixel value, and no row, icon or font size is touched.
    expect(block).not.toMatch(/\d+px\s*[;!]/);
    expect(block).not.toMatch(/settings-row\b[^-]|min-height|font-size/);
  });
});
