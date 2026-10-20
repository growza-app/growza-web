import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-602 — the promises the stock take makes about sizes, pinned in its source (the screen is a client
 * component, so these read the files rather than rendering them).
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const take = read('app/(tenant)/products/StockTake.tsx');
const sheet = read('app/(tenant)/products/CountSizesSheet.tsx');
const css = read('app/(tenant)/styles/99-count-sizes.css');
const en = JSON.parse(read('messages/en.json')) as { products: { stockTake: Record<string, string> } };
const hi = JSON.parse(read('messages/hi.json')) as { products: { stockTake: Record<string, string> } };

describe('one commit, and only what was counted', () => {
  it('Save posts once, with the sizes that have a number typed and the products somebody counted', () => {
    expect(take.match(/api\.saveStockTake\(/g)).toHaveLength(1);
    expect(take).toContain('sizes: sizeLines(shelf, sizeCounts)');
    expect(take).toMatch(/touchedRef\.current\.has\(p\.id\) && !isSizedProduct\(p\)/);
  });

  it('a style with sizes has no box of its own to type in: its row opens the sheet', () => {
    expect(take).toMatch(/sized \? null : \(\s*<input/);
    expect(take).toContain('onClick={() => setSizing(p.id)}');
  });

  it('Save is lit by a counted size, and an invalid size stops it', () => {
    expect(take).toContain('anySizeCounted(shelf, sizeCounts)');
    expect(take).toContain('anySizeInvalid(shelf, sizeCounts)');
  });
});

describe('a long count is not lost (AC-03)', () => {
  it('the walk is kept on the server a moment after the last keystroke, and never before the saved one was read back', () => {
    expect(take).toContain('api.saveStockTakeDraft(');
    expect(take).toMatch(/if \(!draftLoadedRef\.current \|\| !dirtyRef\.current\) return;/);
    expect(take).toContain('window.setTimeout(() => void draftNow.current(), 1200)');
  });

  it('leaving the screen within that moment still keeps the last numbers', () => {
    expect(take).toMatch(/useEffect\(\(\) => \(\) => void draftNow\.current\(\), \[\]\)/);
  });

  it('the saved walk comes back with the shelf, in one breath, and says so', () => {
    expect(take).toMatch(/Promise\.all\(\[api\.stockTakeProducts\(branchId\), api\.stockTakeDraft\(branchId\)/);
    expect(take).toContain('restorable(draft, active)');
    expect(take).toContain("t('stockTake.restored'");
  });

  it('starting over takes two taps — an hour of counting is not thrown away by one', () => {
    expect(take).toContain('setAskClear(true)');
    expect(take).toMatch(/onClick=\{\(\) => void startOver\(\)\}[\s\S]*stockTake\.startOverYes/);
  });
});

describe('the sheet (344px first, tokens only)', () => {
  it('is the sheet the till already uses, a numeric keypad, 16px type, no animation, no raw colour', () => {
    expect(sheet).toContain('pf-keypad-scrim');
    expect(sheet).toContain('inputMode="numeric"');
    expect(css).toMatch(/font-size: 1rem/);
    expect(css).not.toMatch(/animation|transition/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('Enter moves to the next size, and from the last one closes', () => {
    expect(sheet).toContain('inputs.current[i + 1]');
    expect(sheet).toMatch(/else onClose\(\)/);
  });

  it('marks a size that differs by more than colour: a border and a +/− pill', () => {
    expect(sheet).toContain('prd-pill');
    expect(css).toMatch(/\.pcs-row\.is-diff[^}]*border: 2px/s);
  });
});

describe('words, in both languages', () => {
  const keys = ['countSizes', 'sizesCounted', 'sizesNone', 'sizesTitle', 'recorded', 'sizeAria', 'uncounted', 'allCounted', 'doneSizes', 'blankNote', 'kept', 'keptSaving', 'keptFailed', 'restored', 'startOver', 'startOverAsk', 'startOverYes', 'startOverNo', 'sizedChanged'];

  it('every key is in both, filled, with the same placeholders', () => {
    for (const k of keys) {
      expect(en.products.stockTake[k], k).toBeTruthy();
      expect(hi.products.stockTake[k], k).toBeTruthy();
      for (const name of en.products.stockTake[k]!.match(/\{(\w+)/g) ?? []) expect(hi.products.stockTake[k], k).toContain(name);
    }
  });

  it('says "sizes", never "variant" or "SKU"', () => {
    for (const k of keys) expect(en.products.stockTake[k]).not.toMatch(/variant|SKU/i);
  });
});
