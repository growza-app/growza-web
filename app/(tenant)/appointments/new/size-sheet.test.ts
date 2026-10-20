import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from '../../lib/dashboard-root';

/**
 * Jira GRW-599 — what the till's size sheet promises, pinned in its source.
 */
const read = (rel: string) => readFileSync(fromDashboard(rel), 'utf8');
const sheet = read('app/(tenant)/appointments/new/SizeSheet.tsx');
const css = read('app/(tenant)/styles/99-size-sheet.css');
const payFlow = read('app/(tenant)/appointments/new/PayFlow.tsx');
const desk = read('app/(tenant)/appointments/new/DeskServiceGrid.tsx');
const en = JSON.parse(read('messages/en.json')) as { payFlow: { size: Record<string, string> } };
const hi = JSON.parse(read('messages/hi.json')) as { payFlow: { size: Record<string, string> } };

describe('opening the sheet costs no request (the sizes came with the product)', () => {
  it('the sheet makes no call: it formats money and draws what it was given', () => {
    expect(sheet).not.toMatch(/\bapi\.[a-zA-Z]+\(/);
    expect(sheet).not.toMatch(/\bfetch\(/);
    expect(sheet).not.toMatch(/ApiError/);
  });

  it('the till opens it from the product it already holds', () => {
    expect(payFlow).toMatch(/products\.find\(\(p\) => p\.id === sizing\)/);
  });
});

describe('a grid, one tap, no dropdown, no sheet inside a sheet', () => {
  it('sizes are buttons in a wrapping grid, not a <select>', () => {
    expect(sheet).toContain('className="psz-grid"');
    expect(sheet).not.toMatch(/<select/);
    expect(css).toMatch(/\.psz-grid\s*{[^}]*flex-wrap:\s*wrap/);
  });

  it('the quantity is adjusted inline, under the grid', () => {
    expect(sheet).toContain('psz-lines');
    expect(sheet).toMatch(/sizeLess/);
    expect(sheet).toMatch(/sizeMore/);
  });

  it('the order is the order the API sent: no sort in the sheet', () => {
    expect(sheet).not.toMatch(/\.sort\(/);
    expect(sheet).not.toMatch(/localeCompare/);
  });
});

describe('a size with none left (FR-04)', () => {
  it('is shown, dimmed, labelled out of stock, and cannot go on the bill', () => {
    expect(sheet).toMatch(/disabled=\{out \|\| full \|\| !canAddSize\(size, n\)\}/);
    expect(sheet).toContain("t('outOfStock')");
    expect(css).toMatch(/\.psz-cell\.is-out/);
  });

  it('a size on the bill is marked by more than colour: a border, a tick and its quantity', () => {
    expect(css).toMatch(/\.psz-cell\.is-on\s*{[^}]*border:\s*2px/);
    expect(sheet).toContain('<IconCheck />');
  });
});

describe('a double tap adds one (BR-04)', () => {
  it('the same size within a moment is the same tap', () => {
    expect(sheet).toContain('now - lastTap.current.at < 350');
  });

  it('but an explicit + is not a grid tap: two quick + are two units', () => {
    const plus = sheet.slice(sheet.indexOf('ts(\'sizeMore\''));
    expect(plus.slice(0, plus.indexOf('<IconPlus'))).toContain('onAdd(size)');
    expect(plus.slice(0, plus.indexOf('<IconPlus'))).not.toContain('tap(size)');
  });
});

describe('344px: thumb-sized, in tokens and rem', () => {
  it('every cell is at least 44px tall (2.75rem), with 8px gaps', () => {
    expect(css).toMatch(/\.psz-cell\s*{[^}]*min-height:\s*3\.5rem/);
    expect(css).toMatch(/\.psz-grid\s*{[^}]*gap:\s*var\(--sp-2\)/);
  });

  it('no px font-size and no raw colour except the white on the green badge', () => {
    expect(css).not.toMatch(/font-size:\s*\d+(\.\d+)?px/);
    const colours = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(colours).toEqual(['#fff']);
  });
});

describe('a product with no sizes is not changed (FR-06)', () => {
  it('addProduct only diverts a product that has sizes, and the tiles keep their − and + for the rest', () => {
    expect(payFlow).toMatch(/if \(!size && hasSizes\(p\)\) \{\s*setSizing\(p\.id\);/);
    expect(payFlow).toMatch(/\{count > 0 && hasSizes\(p\) \? \(/);
    expect(desk).toMatch(/\{count > 0 && hasSizes\(p\) \? \(/);
  });

  it('the bill sends a size only when the line has one', () => {
    expect(payFlow).toContain('groupProductLines(lines, amounts)');
  });
});

describe('a size sold out or retired meanwhile (AC-02)', () => {
  it('and says a size changed, in the shopkeeper’s words, when the bill carried a size', () => {
    expect(payFlow).toContain("ts('changed')");
    expect(payFlow).toMatch(/lines\.some\(\(l\) => l\.product\?\.variantId\)/);
  });

  it('a refusal on products reads the shelf again, so the sizes shown are the ones there', () => {
    expect(payFlow).toMatch(/e\.field === 'products'\) void api\.products\(location\)\.then\(setProducts\)/);
  });
});

describe('words, in both languages', () => {
  const used = [...sheet.matchAll(/\bts\(\s*'([A-Za-z]+)'/g)].map((m) => m[1]!);
  it('every key the sheet asks for is in English and in Hindi, and the two have the same keys', () => {
    for (const key of new Set(used)) {
      expect(en.payFlow.size[key], `en ${key}`).toBeTruthy();
      expect(hi.payFlow.size[key], `hi ${key}`).toBeTruthy();
    }
    expect(Object.keys(hi.payFlow.size).sort()).toEqual(Object.keys(en.payFlow.size).sort());
  });

  it('the shopkeeper reads "size", never "variant" or "SKU"', () => {
    for (const text of Object.values(en.payFlow.size)) expect(text).not.toMatch(/variant|SKU/i);
  });
});
