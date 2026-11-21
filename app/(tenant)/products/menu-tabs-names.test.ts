import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Comments out: the rule's own comment says what display:none used to do.
const css = readFileSync(resolve(__dirname, '../styles/99-menu-manager.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const list = readFileSync(resolve(__dirname, 'ProductsList.tsx'), 'utf8');

/** Develop QA 2026-11-21, finding 9 — the Menu's tabs keep their words for a screen reader when the short label shows. */
describe('the Menu tabs are named, not just counted', () => {
  it('the short label is for the eye alone and the long one is never display:none', () => {
    expect(list).toContain('<span className="mnu-tab-short" aria-hidden="true">');
    const longRules = [...css.matchAll(/\.mnu-tab-long\s*\{([^}]*)\}/g)].map((m) => m[1]!);
    expect(longRules.length).toBeGreaterThanOrEqual(2);
    for (const body of longRules) {
      expect(body).not.toMatch(/display:\s*none/);
      expect(body).toContain('clip-path: inset(50%)');
    }
  });
});
