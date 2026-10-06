import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-520 — the client search is a dropdown: matches float under the box over the form instead of
 * pushing it down, with the keyboard and screen-reader behaviour a combobox owes.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));
const css = strip(readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8'));

describe('the client search dropdown', () => {
  it('floats over the form: positioned under the box, scrolling inside itself', () => {
    expect(css).toMatch(/\.wi-combo \{\s*position: relative;/);
    expect(css).toMatch(/\.wi-dropdown \{[^}]*position: absolute;[^}]*left: 0;\s*right: 0;\s*max-height: 260px;\s*overflow-y: auto;/);
  });

  it('is a combobox for a screen reader', () => {
    expect(sheet).toMatch(/role="combobox"/);
    expect(sheet).toMatch(/aria-expanded=\{showDrop\}/);
    expect(sheet).toMatch(/aria-controls="wi-dropdown"/);
    expect(sheet).toMatch(/aria-activedescendant=\{showDrop && activeIdx >= 0 \? `wi-opt-\$\{activeIdx\}` : undefined\}/);
    expect(sheet).toMatch(/role="listbox"/);
    expect(sheet).toMatch(/role="option"/);
  });

  it('arrows move, Enter picks, Escape closes the dropdown and not the sheet', () => {
    expect(sheet).toMatch(/e\.key === 'ArrowDown'/);
    expect(sheet).toMatch(/e\.key === 'ArrowUp'/);
    expect(sheet).toMatch(/e\.key === 'Enter' && activeIdx >= 0/);
    expect(sheet).toMatch(/e\.key === 'Escape'\) \{\s*(?:\/\/[^\n]*\n\s*)?e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*setComboOpen\(false\);/);
  });

  it('a tap on a row is not preceded by the box losing focus', () => {
    expect(sheet).toMatch(/onPointerDown=\{\(e\) => e\.preventDefault\(\)\}/);
    expect(sheet).toMatch(/if \(!e\.currentTarget\.contains\(e\.relatedTarget as Node \| null\)\) setComboOpen\(false\);/);
  });

  it('still says when nothing matches, and picking goes on as before', () => {
    expect(sheet).toMatch(/!searching && results\.length === 0 && elsewhere\.length === 0 && <div className="empty">\{nv\.noMatch\}<\/div>/);
    expect(sheet).toMatch(/onClick=\{\(\) => pickClient\(c\)\}/);
  });
});
