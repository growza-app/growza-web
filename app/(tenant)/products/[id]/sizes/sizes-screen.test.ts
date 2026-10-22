import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from '../../../lib/dashboard-root';

/**
 * Jira GRW-598 — what the Sizes screen promises, pinned in its source.
 *
 * The grid rules are tested where they live (`grid-model.test.ts`); this file pins the things a later edit could undo
 * without a test noticing: one request per save, the switch that hides it, copy in both languages, sizes in rem, targets
 * a thumb can hit, and a grid that scrolls in its own box rather than the page.
 */
const read = (rel: string) => readFileSync(fromDashboard(rel), 'utf8');
const grid = read('app/(tenant)/products/[id]/sizes/SizesGrid.tsx');
const page = read('app/(tenant)/products/[id]/sizes/page.tsx');
const sheet = read('app/(tenant)/products/ProductSheet.tsx');
const css = read('app/(tenant)/styles/99-sizes.css');
const en = JSON.parse(read('messages/en.json')) as { products: { sizes: Record<string, string> } };
const hi = JSON.parse(read('messages/hi.json')) as { products: { sizes: Record<string, string> } };

describe('one save, one request (AC-01)', () => {
  it('the screen calls the grid write exactly once, and never from inside a loop', () => {
    expect(grid.match(/api\.saveSizeGrid\(/g)).toHaveLength(1);
    expect(grid).not.toMatch(/\.(map|forEach)\([^)]*saveSizeGrid/);
  });

  it('the request is built by the model, so what is sent is what the tests say', () => {
    expect(grid).toContain('toRequest(state, baseline)');
  });

  it('a save that the model says is not dirty, or that has a bad cell, never reaches the network', () => {
    const save = grid.slice(grid.indexOf('const save = async'));
    expect(save.indexOf('!dirty')).toBeGreaterThan(-1);
    expect(save.indexOf('problems(state)')).toBeLessThan(save.indexOf('api.saveSizeGrid'));
  });
});

describe('the switch (sizes are off for every business until turned on)', () => {
  it('the page sends a business without sizes back to Products', () => {
    expect(page).toMatch(/capabilities\?\.sizes === true/);
    expect(page).toMatch(/redirect\('\/products'\)/);
  });

  it('the product sheet draws the Sizes row and the Open button only while sizes are on', () => {
    expect(sheet).toContain('const sizesOn = useSizesOn()');
    expect(sheet).toMatch(/\{product && sizesOn \? \(/);
    expect(sheet).toMatch(/\{sizesOn \? \(\s*<AppLink/);
  });

  it('the Stock tab of a product with sizes does not offer a count of the style', () => {
    expect(sheet).toMatch(/part === 'stock' && product && sizeCount > 0/);
  });
});

describe('words, in both languages', () => {
  const used = [...grid.matchAll(/\bt\(\s*'([A-Za-z.]+)'/g), ...grid.matchAll(/\bt\(\s*(?:i === 0 \? )?'([A-Za-z]+)'\s*:\s*'([A-Za-z]+)'/g)].flatMap((m) => m.slice(1)).filter(Boolean);
  const dynamic = ['badCount', 'badPrice', 'optionNamePlaceholder', 'secondNamePlaceholder', 'moveUp', 'moveDown', 'moveLeft', 'moveRight'];

  it('every key the screen asks for is in English and in Hindi', () => {
    for (const key of new Set([...used, ...dynamic])) {
      expect(en.products.sizes[key], `en ${key}`).toBeTruthy();
      expect(hi.products.sizes[key], `hi ${key}`).toBeTruthy();
    }
  });

  it('the two languages have the same keys', () => {
    expect(Object.keys(hi.products.sizes).sort()).toEqual(Object.keys(en.products.sizes).sort());
  });

  it('the owner reads "Sizes" and never "variant" or "SKU" on this screen (UX-03)', () => {
    for (const text of Object.values(en.products.sizes)) expect(text).not.toMatch(/variant|SKU/i);
  });
});

describe('phone first (344px)', () => {
  it('the grid scrolls in its own box, with the size column pinned', () => {
    expect(css).toMatch(/\.szg-scroll\s*{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.szg-rowhead[\s\S]*?position:\s*sticky/);
  });

  it('type is in tokens and rem: no px font-size', () => {
    expect(css).not.toMatch(/font-size:\s*\d+(\.\d+)?px/);
  });

  it('every control is at least 44px tall (2.75rem), counts are 16px so a phone does not zoom on focus', () => {
    expect(css).toMatch(/\.szg-input\s*{[^}]*min-height:\s*2\.75rem/);
    expect(css).toMatch(/\.szg-input\s*{[^}]*font-size:\s*var\(--fs-5\)/);
    expect(css).toMatch(/\.szg-icon\s*{[^}]*width:\s*2\.75rem;[^}]*height:\s*2\.75rem/);
    expect(css).toMatch(/\.szg-card input\[type='text'\]\s*{[^}]*min-height:\s*2\.75rem/);
  });

  it('no raw colour: only the design tokens', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('the count box asks for the number pad', () => {
    expect(grid).toMatch(/inputMode="numeric"/);
    expect(grid).toMatch(/pattern="\[0-9\]\*"/);
  });

  it('Save is the pinned bar the Settings screens use, under the thumb', () => {
    expect(grid).toContain('settings-savebar settings-savebar-pinned');
  });
});

describe('what the owner typed is never lost to an error', () => {
  it('a refused save keeps the grid as it was; only a changed-under-you save replaces it, and says so', () => {
    const save = grid.slice(grid.indexOf('const save = async'));
    expect(save).toContain("err.field === 'version'");
    expect(save).toContain("t('changedUnder')");
    // The other refusals set a message and touch nothing else.
    const other = save.slice(save.indexOf('else if (err instanceof ApiError && err.status < 500)'));
    expect(other.slice(0, other.indexOf('} finally'))).not.toMatch(/setState|setBaseline/);
  });
});
