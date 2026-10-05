import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-504 — a clay style: one stylesheet, loaded last, shadow and radius only. Jira GRW-539 — on HOME only,
 * plus the bottom bar and its plus button, which are on every screen.
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

  it('sets shadow, radius and the primary gradient — and no colour, size or layout', () => {
    const decls = [...css.matchAll(/^\s+([a-z-]+):/gm)].map((m) => m[1] ?? '');
    const allowed = new Set(['--radius', '--radius-sm', '--clay-raise', '--clay-raise-soft', '--clay-press', '--clay-green', 'box-shadow', 'background-image']);
    expect([...new Set(decls)].filter((d) => !allowed.has(d))).toEqual([]);
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

  it('every rule is scoped to Home, except the bottom bar and its plus (Jira GRW-539)', () => {
    const SC = '.content:has(.hm-page)';
    // Strip comments, then every selector at the start of a line outside @media/:root must carry the scope.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const barAt = code.indexOf('@media (max-width: 860px) {');
    const barEnd = code.indexOf('}\n}', barAt) + 3;
    const scoped = code.slice(0, barAt) + code.slice(barEnd);
    const selectors = [...scoped.matchAll(/(?:^|\n)([^\s{}:@][^{}]*?)\s*\{/g)].map((m) => (m[1] ?? '').trim());
    for (const sel of selectors.flatMap((x) => x.split(/,\s*\n/))) {
      expect(sel.startsWith(SC), `${sel} is not scoped to Home`).toBe(true);
    }
    expect(selectors.length).toBeGreaterThan(10);
  });

  it('the bottom bar and the plus keep their clay on every screen', () => {
    const from = css.indexOf('@media (max-width: 860px) {');
    const bar = css.slice(from, css.indexOf('}\n}', from) + 3);
    expect(bar).toMatch(/\.bottom-nav \{\s*box-shadow:/);
    expect(bar).toMatch(/\.bn-centre \{\s*box-shadow: var\(--clay-green\);/);
    expect(bar).not.toMatch(/content:has/);
  });

  it('the rounder radii are Home\'s too, not the whole app\'s', () => {
    expect(css).not.toMatch(/:root \{[^}]*--radius/);
    expect(css).toMatch(/\.content:has\(\.hm-page\) \{\s*--radius: 18px;\s*--radius-sm: 14px;/);
  });
});
