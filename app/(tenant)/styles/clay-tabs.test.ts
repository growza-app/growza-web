import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-499 · GRW-500 — the clay tab strip, and the way it changes tab.
 *
 * It lives in one stylesheet, loaded last, so it can be removed by deleting the file and its import.
 * The change of tab is a fade-and-settle on the tab's own ::before: short (under 200ms), eased out with
 * no overshoot, and switched off for a reader who asked for less motion.
 */
const css = readFileSync(resolve(__dirname, '100-clay-tabs.css'), 'utf8');
const globals = readFileSync(resolve(__dirname, '../globals.css'), 'utf8');

describe('the clay tabs', () => {
  it('is loaded last, as one import', () => {
    const imports = globals.match(/@import '\.\/styles\/[^']+';/g) ?? [];
    expect(imports[imports.length - 1]).toBe("@import './styles/100-clay-tabs.css';");
  });

  it('eases in under 200ms, with no overshoot', () => {
    for (const [, ms] of css.matchAll(/opacity ([0-9.]+)s/g)) expect(Number(ms)).toBeLessThan(0.2);
    // Every control point stays inside 0..1 — a y above 1 is a bounce.
    for (const [, y1, y2] of css.matchAll(/cubic-bezier\([0-9.]+, ([0-9.-]+), [0-9.]+, ([0-9.-]+)\)/g)) {
      expect(Number(y1)).toBeLessThanOrEqual(1);
      expect(Number(y2)).toBeLessThanOrEqual(1);
    }
  });

  it('animates the raised piece, not the layout', () => {
    expect(css).toMatch(/\.page-tab\.active::before \{\s*opacity: 1;\s*transform: scale\(1\);/);
    expect(css).not.toMatch(/transition:[^;]*(width|height|padding|margin)/);
  });

  it('has soft corners and a light emboss (Jira GRW-501)', () => {
    expect(css).toMatch(/\.page-tabs \{[^}]*border-radius: 18px;/);
    expect(css).toMatch(/\.page-tab \{[^}]*border-radius: 13px;/);
    // No offset past 3px: a deeper shadow is the heavy look this story took out.
    for (const [, n] of css.matchAll(/(?:inset )?-?(\d+)px -?\d+px \d+px rgba/g)) expect(Number(n)).toBeLessThanOrEqual(3);
  });

  it('the selected tab is green on every strip, with white text (Jira GRW-502)', () => {
    expect(css).toMatch(/\.page-tab::before \{[^}]*background: linear-gradient\(145deg, #178246, #126a38\);/);
    expect(css).toMatch(/\.page-tab\.active \{[^}]*color: #fff;/);
    expect(css).toMatch(/\.page-tab\.active \.page-tab-count \{\s*color: #fff;/);
    expect(css).toMatch(/\.wi-segmented button\.is-on,\s*\.bk-view-tab\.is-active \{[^}]*background: linear-gradient\(145deg, #178246, #126a38\);[^}]*color: #fff;/);
    // The two that were already green stay on the shared deep green.
    const home = readFileSync(resolve(__dirname, '83-role-home.css'), 'utf8');
    expect(home).toMatch(/\.hm-seg button\.is-on \{[^}]*var\(--hm-green-deep\)/);
    const a11y = readFileSync(resolve(__dirname, '90-accessibility.css'), 'utf8');
    expect(a11y).toMatch(/\.rp-tabs button\.active,[^{]*\{[^}]*background: var\(--accent-deep\);/);
  });

  it('switches the motion off for a reader who asked for less', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.page-tab,\s*\.page-tab::before \{\s*transition: none;/);
  });
});
