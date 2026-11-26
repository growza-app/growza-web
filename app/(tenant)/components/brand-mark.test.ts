import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const code = (p: string) =>
  readFileSync(resolve(__dirname, p), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

/** Owner, 2026-11-26 — option B, "every business": the red-roof house beside the business's name. */
describe("the mark beside the business's name", () => {
  const sidebar = code('Sidebar.tsx');
  const icons = readFileSync(resolve(__dirname, 'icons.tsx'), 'utf8');

  it('is the red-roof house on the phone menu card and the laptop sidebar card, for every business', () => {
    expect(sidebar.match(/<IconBrandHouse \/>/g)).toHaveLength(2);
    expect(sidebar).not.toContain('IconStorefront');
    expect(sidebar).not.toMatch(/restaurant|chef/i);
  });

  it('is copied in as inline SVG with its source and licence named, not installed', () => {
    expect(icons).toContain('github.com/icons8/flat-color-icons, MIT licence');
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('react-icons');
  });

  it('sits on a white chip on the green glass card', () => {
    const css = code('../styles/99-z-emerald-v2.css');
    expect(css).toMatch(/\.brand-card \.brand-badge \{[^}]*background: #fff;/);
  });
});

/** Owner, 2026-11-26 ("do both") — one POS icon everywhere, and the current page's icon filled in. */
describe('the menu icons', () => {
  it('draws POS as the cash register, the same one the bottom bar shows', () => {
    const icons = readFileSync(resolve(__dirname, 'icons.tsx'), 'utf8');
    const pos = icons.slice(icons.indexOf('export const IconPos'), icons.indexOf(');', icons.indexOf('export const IconPos')));
    expect(pos).toContain('<path d="M5.5 10h13l1.5 7H4Z" />');
    expect(icons).not.toContain('IconCashRegister');
    expect(code('BottomNav.tsx')).toMatch(/<span className="bn-pos-btn" aria-hidden="true">\s*<IconPos \/>/);
  });

  it('marks the current page with a mint pill, not a white strip and an edge bar (option A)', () => {
    const css = code('../styles/99-z-emerald-v2.css');
    const tail = css.slice(css.lastIndexOf('.nav a.active {'));
    expect(tail).toMatch(/^\.nav a\.active \{\s*background: color-mix\(in srgb, var\(--mint\) 35%, var\(--surface\)\);/);
    expect(tail).toMatch(/\.nav a\.active::before \{\s*content: none;/);
  });

  it("fills the current page's icon with a wash of its own green", () => {
    const css = code('../styles/99-z-emerald-v2.css');
    expect(css).toContain('.nav a.active svg :is(path, rect, circle, polygon, ellipse) {\n  fill: color-mix(in srgb, currentColor 35%, transparent);');
  });
});
