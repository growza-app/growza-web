import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-526 — New booking is a focused full screen: no bottom tab bar under it, on any step.
 * Every `.content` row is pinned by its own `grid-row` (01-shell.css), so leaving the bar out cannot move the
 * others; and the page keeps the home-indicator inset the bar used to carry.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const chrome = strip(readFileSync(resolve(__dirname, 'MobileChrome.tsx'), 'utf8'));
const css = strip(readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8'));
const source = /const NO_BAR_ROUTE_RE = \/(.*)\/;/.exec(chrome)?.[1] ?? '$^';
const noBar = (p: string) => new RegExp(source).test(p);

describe('the New booking screen has no tab bar', () => {
  it('draws nothing for it, after every hook has run', () => {
    expect(chrome).toMatch(/if \(NO_BAR_ROUTE_RE\.test\(pathname\)\) return null;/);
    expect(chrome.indexOf('useRouter()')).toBeLessThan(chrome.indexOf('return null'));
  });

  it('matches the New booking page and any step under it, and nothing else', () => {
    for (const p of ['/appointments/new', '/appointments/new/']) expect(noBar(p)).toBe(true);
    for (const p of ['/', '/appointments', '/customers', '/appointments/newer', '/notifications', '/providers/new']) {
      expect({ p, noBar: noBar(p) }).toEqual({ p, noBar: false });
    }
  });

  it('the page keeps the home-indicator inset the bar carried', () => {
    expect(css).toMatch(/\.page-body:has\(> \.walk-in-page\) \{\s*padding-bottom: calc\(var\(--sp-4\) \+ env\(safe-area-inset-bottom, 0px\)\);/);
  });
});
