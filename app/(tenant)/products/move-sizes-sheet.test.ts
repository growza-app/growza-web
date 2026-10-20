import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-601 — the promises the move-sizes sheet makes, pinned in its source (the sheet is a client component, so
 * these read the files rather than rendering them).
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const sheet = read('app/(tenant)/products/MoveSizesSheet.tsx');
const entry = read('app/(tenant)/products/MoveSizesEntry.tsx');
const css = read('app/(tenant)/styles/99-move-sizes.css');
const en = JSON.parse(read('messages/en.json')) as { products: { moveSizes: Record<string, string> } };
const hi = JSON.parse(read('messages/hi.json')) as { products: { moveSizes: Record<string, string> } };

describe('one send, one request', () => {
  it('the sheet calls the transfer exactly once, never inside a loop, and only with the sizes that have something to send', () => {
    expect(sheet.match(/api\.transferSizes\(/g)).toHaveLength(1);
    expect(sheet).not.toMatch(/\.(map|forEach)\([^)]*transferSizes/);
    expect(sheet).toContain('sizes: lines');
  });

  it('Send is off with no branch, nothing to send, or a send already on its way', () => {
    expect(sheet).toMatch(/const canSend = !busy && toId !== '' && total > 0/);
    expect(sheet).toContain('disabled={!canSend}');
  });

  it('the owner’s numbers survive a refusal: the catch never clears them', () => {
    const catchBlock = sheet.slice(sheet.indexOf('} catch (err)'), sheet.indexOf('} finally'));
    expect(catchBlock).not.toContain('setQtys');
    expect(catchBlock).toContain('setError');
  });

  it('the sizes load once when the sheet opens, and again only to show the counts as they are after a refusal', () => {
    expect(sheet.match(/api\s*\.productSizes\(/g)).toHaveLength(1);
  });
});

describe('who sees the way in', () => {
  it('only while sizes are on, for someone who can move stock, and with another branch to send to', () => {
    expect(entry).toContain('useSizesOn()');
    expect(entry).toMatch(/if \(!sizesOn \|\| !canMove \|\| others\.length === 0\) return null/);
  });

  it('the product sheet offers it on the Stock part of a product with sizes — and nowhere else', () => {
    const sheetSrc = read('app/(tenant)/products/ProductSheet.tsx');
    expect(sheetSrc.match(/<MoveSizesEntry/g)).toHaveLength(1);
    expect(sheetSrc.indexOf('<MoveSizesEntry')).toBeGreaterThan(sheetSrc.indexOf("part === 'stock' && product && sizeCount > 0"));
    expect(sheetSrc.indexOf('<MoveSizesEntry')).toBeLessThan(sheetSrc.indexOf('<StockPanel'));
  });
});

describe('the look (344px first, tokens only)', () => {
  it('uses the sheet the till already uses, 44px steppers, no raw colour, no animation', () => {
    expect(sheet).toContain('pf-keypad-scrim');
    expect(sheet).toContain('pf-qty-btn');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/animation|transition/);
    expect(css).toMatch(/grid-template-columns: 2\.75rem 2rem 2\.75rem/);
  });

  it('a size at zero is marked by more than colour: dashed border and the words "None here"', () => {
    expect(css).toMatch(/\.pmv-row\.is-out[^}]*dashed/s);
    expect(en.products.moveSizes.none).toBe('None here');
  });
});

describe('words, in both languages', () => {
  it('have the same keys, every one filled', () => {
    expect(Object.keys(hi.products.moveSizes).sort()).toEqual(Object.keys(en.products.moveSizes).sort());
    for (const text of Object.values(hi.products.moveSizes)) expect(text.trim()).not.toBe('');
  });

  it('say "sizes", never "variant" or "SKU"', () => {
    for (const text of Object.values(en.products.moveSizes)) expect(text).not.toMatch(/variant|SKU/i);
  });

  it('every placeholder in English is in the Hindi sentence too', () => {
    for (const [key, text] of Object.entries(en.products.moveSizes)) {
      for (const name of text.match(/\{(\w+)\}/g) ?? []) expect(hi.products.moveSizes[key], key).toContain(name);
    }
  });
});
