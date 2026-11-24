import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from '../lib/dashboard-root';

/**
 * Owner, 2026-11-24 (option A) — the laptop sidebar is a slim dark-green bar of icons, from the owner's reference shot:
 * an orange round logo, the till as an orange round button at the foot, and the bar widening over the page when the
 * pointer rests on it, the keyboard is in it, or the logo is tapped. The page never moves; the phone drawer is untouched.
 */
const read = (rel: string) => readFileSync(fromDashboard(rel), 'utf8');
const nav = read('app/(tenant)/components/Sidebar.tsx');
const css = read('app/(tenant)/styles/99-zz-slim-rail.css');
const base = read('app/(tenant)/styles/00-base.css');
const globals = read('app/(tenant)/globals.css');

describe('the slim laptop bar', () => {
  it('is a laptop thing only, loaded after Emerald and before the last sheet', () => {
    expect(css.trimStart().startsWith('/*')).toBe(true);
    expect(css).toMatch(/@media \(min-width: 861px\) \{\s*\.shell:has\(> \.sidebar\) \{\s*grid-template-columns: calc\(var\(--rail-w\) \+ 0\.75rem\) minmax\(0, 1fr\);/);
    const at = (sheet: string) => globals.indexOf(`@import './styles/${sheet}';`);
    expect(at('99-zz-slim-rail.css')).toBeGreaterThan(at('99-z-emerald-v2.css'));
    expect(at('99-zz-slim-rail.css')).toBeLessThan(at('99-photo-none.css'));
    expect(at('99-z-emerald-v2.css')).toBeGreaterThan(-1);
  });

  it('widens over the page — open on rest (after a moment), on the keyboard, or on the logo — and the column stays narrow', () => {
    expect(css).toContain(".shell > .sidebar:is([data-rail='open'], :has(:focus-visible)) {\n    width: var(--rail-open-w);");
    expect(nav).toContain("data-rail={railOpen || railHover ? 'open' : undefined}");
    expect(nav).toContain('export const RAIL_HOVER_DELAY_MS = 200;');
    expect(nav).toMatch(/if \(e\.pointerType === 'touch'\) return;/);
    expect(nav).toMatch(/className="rail-toggle"\s*aria-expanded=\{railOpen\}/);
  });

  it('a tap outside or Escape closes the bar the logo opened', () => {
    expect(nav).toContain("if (!drawerRef.current?.contains(e.target as Node)) setRailOpen(false);");
    expect(nav).toContain("if (e.key === 'Escape') setRailOpen(false);");
  });

  it('the words fade but stay the links\' names (opacity, never display or visibility)', () => {
    expect(nav).toContain('<span className="nav-label">{item.label}</span>');
    expect(css).toMatch(/:is\(\.brand-growza-word, \.nav-label, \.nav-section, \.nav-pill, \.nav-fold, \.acct-trigger-text\),[^{]*\{\s*opacity: 0;/);
  });

  it('the till is the orange round button at the foot; the colours are tokens', () => {
    expect(nav).toContain("className: 'nav-pos'");
    expect(css).toMatch(/\.nav-pos \{\s*order: 1;\s*margin-top: auto;/);
    expect(base).toContain('--rail-orange: #d9702a;');
    expect(base).toContain('--rail-bg: #24574a;');
  });

  it('reduced motion: it opens at once', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.shell > \.sidebar,\s*\.shell > \.sidebar \* \{\s*transition: none !important;/);
  });
});
