import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-504 — the whole app in a clay style: one stylesheet, loaded last, shadow and radius only.
 *
 * Two things went wrong the first time it was drawn, and are pinned here: the primary button's green
 * gradient landed on `.btn-ghost` (Filter and Export read as dark text on green, because `.btn` is the base
 * of the secondary buttons too), and a bare input inside a bordered search bar took a press of its own and
 * doubled into a dark inner box.
 */
const css = readFileSync(resolve(__dirname, '101-clay-app.css'), 'utf8');
const globals = readFileSync(resolve(__dirname, '../globals.css'), 'utf8');

describe('the clay app stylesheet', () => {
  it('is loaded last, as one import, after the tab strip', () => {
    const imports: string[] = globals.match(/@import '\.\/styles\/[^']+';/g) ?? [];
    expect(imports[imports.length - 1]).toBe("@import './styles/101-clay-app.css';");
    expect(imports[imports.length - 2]).toBe("@import './styles/100-clay-tabs.css';");
  });

  /** Owner, 2026-10-07 — the people are pieces of clay too: raised, green when chosen, pressed under a thumb. */
  it('gives the stylist row the same three moves as everything else', () => {
    expect(css).toMatch(/\.wi-stylist-chips \.wi-chip \{\s*box-shadow: var\(--clay-raise-soft\);/);
    expect(css).toMatch(/\.wi-stylist-chips \.wi-chip-on \{[^}]*box-shadow: var\(--clay-green\);/);
    expect(css).toMatch(/\.wi-stylist-chips \.wi-chip:active:not\(:disabled\) \{\s*box-shadow: var\(--clay-press\);/);
    // The one state that must not look pressable.
    expect(css).toMatch(/\.wi-stylist-chips \.wi-chip:disabled \{\s*box-shadow: none;\s*\}/);
  });

  it('sets shadow, radius and the primary gradient — and no colour, size or layout', () => {
    const decls = [...css.matchAll(/^\s+([a-z-]+):/gm)].map((m) => m[1] ?? '');
    const allowed = new Set(['--radius', '--radius-sm', '--clay-raise', '--clay-raise-soft', '--clay-press', '--clay-green', 'box-shadow', 'background-image', 'border-radius']);
    expect([...new Set(decls)].filter((d) => !allowed.has(d))).toEqual([]);
  });

  /** Owner, 2026-10-08 — Reports: the pieces inside its cards are clay too, and a figure that goes nowhere is flat. */
  it('raises the Reports chips, presses the chosen one, and keeps a disabled band flat', () => {
    expect(css).toMatch(/\.rp-cs-band,\s*\.rp-cs-group,[^{]*\{\s*box-shadow: var\(--clay-raise-soft\);/);
    expect(css).toMatch(/\.rp-cs-band\.is-on \{\s*box-shadow: var\(--clay-press\);/);
    expect(css).toMatch(/\.rp-cs-band:disabled \{\s*box-shadow: none;/);
    expect(css).toMatch(/\.rp-tabs button\.active \{[^}]*box-shadow: var\(--clay-raise-soft\);/);
  });

  it('puts the green on the plain primary button only', () => {
    expect(css).toMatch(/\.btn:not\(\.btn-ghost\):not\(\.btn-danger\):not\(\.btn-danger-solid\),/);
    // No bare `.btn {` rule with a gradient.
    expect(css).not.toMatch(/^\.btn,\s*$/m);
  });

  it('a bare input in a bordered bar takes no press of its own', () => {
    expect(css).toMatch(/:where\(input:not\(/);
    expect(css).toMatch(/\.bk-search-row input,[\s\S]*?\{\s*box-shadow: none;/);
  });

  it('a disabled button stays flat', () => {
    expect(css).toMatch(/\.btn:disabled,[\s\S]*?\{\s*box-shadow: none;/);
  });

  /** Jira GRW-552 — a phone audit found these still flat: the token card and its buttons, Reports, the waiting section. */
  it('raises the surfaces a phone audit found flat', () => {
    expect(css).toMatch(/\.rp-card,\n\.bk-waiting \{\s*box-shadow: var\(--clay-raise\);/);
    expect(css).toMatch(/\.hm-toolbar-summary,\n\.hm-give,\n\.rp-control \{\s*box-shadow: var\(--clay-raise-soft\);/);
    expect(css).toMatch(/@media \(max-width: 860px\) \{[^@]*\.tb-board \.tb-row \{\s*box-shadow: var\(--clay-raise\);/);
  });

  /** Jira GRW-553 · GRW-554 — the quick-link tiles are domes; the glyph on them has no shadow of its own. */
  it('raises the quick-link tiles and leaves their glyphs flat', () => {
    expect(css).toMatch(/\.hm-tile-icon \{[^}]*background-image: linear-gradient\(145deg, rgba\(255, 255, 255, 0\.7\)[^}]*box-shadow: var\(--clay-raise\);/);
    expect(css).not.toMatch(/\.hm-tile-icon svg/);
    expect(css).not.toMatch(/drop-shadow|filter:/);
    expect(css).toMatch(/\.hm-tile:active \.hm-tile-icon \{\s*box-shadow: var\(--clay-press\);/);
  });

  it('draws the selected bottom-bar tab as a glass lens, and leaves the others plain', () => {
    const chrome = readFileSync(resolve(__dirname, '74-mobile-chrome-2026.css'), 'utf8');
    expect(chrome).toMatch(/\.bottom-nav a\.active::before \{[^}]*backdrop-filter: blur\(6px\);/);
    expect(chrome).not.toMatch(/\.bottom-nav a::before/);
    expect(chrome).not.toMatch(/--bn-tint|--bn-ink/);
    expect(css).toMatch(/\.bottom-nav a\.active::before \{\s*background-image: linear-gradient\(180deg[^}]*box-shadow:/);
  });

  it('a disabled primary button loses the green gradient too, so its grey label can be read', () => {
    expect(css).toMatch(/\.btn:not\(\.btn-ghost\):not\(\.btn-danger\):not\(\.btn-danger-solid\):disabled,[\s\S]*?\{\s*background-image: none;\s*box-shadow: none;/);
  });

  it('Sign in stays green when disabled: muted green, white label, 4.5:1 or better (the colour is in the login sheet, not here)', () => {
    const login = readFileSync(resolve(__dirname, '70-what-does-this-count.css'), 'utf8');
    expect(login).toMatch(/\.login-submit:disabled \{\s*background: #3f8157;\s*color: #fff;/);
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    expect(1.05 / (lum('#3f8157') + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
