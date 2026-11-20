import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { SAMPLE_MENU_FILE } from './ImportMenu';

/**
 * Jira GRW-715 — a kitchen's menu from a file. Source-reading, like the other dialog tests here: no DOM in this suite. The
 * browser run (e2e/restaurant/specs/12-petpooja-menu-import.spec.ts in the API repo) drives the real thing.
 */
const dialog = readFileSync(resolve(__dirname, 'ImportMenu.tsx'), 'utf8');
const list = readFileSync(resolve(__dirname, 'ProductsList.tsx'), 'utf8');

describe('the dialog', () => {
  it('sends only the dishes that are new: one already on the menu is never touched (BR-02)', () => {
    expect(dialog).toContain('const fresh = review?.dishes.filter((d) => !d.onMenu) ?? [];');
    expect(dialog).toContain('api.importMenu(branchId, fresh.map(({ onMenu: _onMenu, ...d }) => d))');
  });

  it('Add is off when nothing is new, and while adding — one tap, one menu', () => {
    expect(dialog).toContain('disabled={busy || fresh.length === 0}');
    expect(dialog).toMatch(/if \(!review \|\| fresh\.length === 0 \|\| busy\) return;/);
  });

  it('says which branch the dishes go to before Add', () => {
    expect(dialog).toContain("t('branch', { branch: branchName })");
  });

  it('gives each skipped row its reason in words, not a code', () => {
    expect(dialog).toContain('t(`reason.${s.reason}`)');
    for (const reason of ['no_name', 'no_price', 'bad_price', 'bad_gst', 'twice_in_file', 'size_twice', 'too_many_sizes', 'name_too_long']) {
      expect(en.products.menuImport.reason).toHaveProperty(reason);
      expect(hi.products.menuImport.reason).toHaveProperty(reason);
    }
  });

  it('the sample file carries every column the reader looks for', () => {
    expect(SAMPLE_MENU_FILE.split('\n')[0]).toBe('Category,Dish,Size,Price,GST %,HSN,Extras group,Extras');
  });

  it('has its words in English and Hindi, key for key', () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v).map((x) => `${k}.${x}`) : [k]));
    expect(keys(hi.products.menuImport).sort()).toEqual(keys(en.products.menuImport).sort());
  });

  it('uses plain words: no "variation", "SKU" or "parse" on the screen', () => {
    const words = JSON.stringify([en.products.menuImport, hi.products.menuImport]).toLowerCase();
    for (const jargon of ['variation', 'sku', 'parse', 'import']) expect(words).not.toContain(jargon);
  });
});

describe('the loopholes (owner, 2026-11-17)', () => {
  it('L5 — veg marks and descriptions the file carried are named as not kept', () => {
    expect(dialog).toContain("review.notKept.includes('veg') ? <p className=\"mi-note\">{t('notKeptVeg')}</p>");
    expect(dialog).toContain("review.notKept.includes('description') ? <p className=\"mi-note\">{t('notKeptDescription')}</p>");
  });

  it('L6 — a dish on the menu at another price says its menu price is not changed, and points to changing prices', () => {
    expect(dialog).toContain('d.onMenu && d.menuPriceMinor !== undefined && d.menuPriceMinor !== d.priceMinor');
    expect(dialog).toContain("t('menuPrice', { price: money(d.menuPriceMinor!) })");
    expect(dialog).toMatch(/t\('pricesDiffer', \{ n: differing \}\)[\s\S]{0,200}onClick=\{onPricesFromFile\}/);
  });
});

describe('the Menu screen', () => {
  it("a kitchen's Import opens the menu file; a shop's opens the column-by-column import", () => {
    expect(list).toContain('const openImport = () => (counted ? setImportOpen(true) : setMenuOpen(true));');
    // The shop's desk tools, the footer row and the empty state each carry one; the kitchen's Menu card has it in its
    // ⋮ of set-up jobs (owner, 2026-11-20, "quiet table").
    expect(list.match(/onClick=\{openImport\}/g)).toHaveLength(3);
    expect(list).toContain("{ label: t('import.open'), onSelect: openImport }");
  });

  it('prices can still be changed from a file, through the column-by-column import', () => {
    expect(list).toMatch(/onPricesFromFile=\{\(\) => \{\s*setMenuOpen\(false\);\s*setImportOpen\(true\);/);
  });
});

describe('QA 2026-11-17 — a turned iPad keeps the review', () => {
  it('the dialogs are drawn at one place in both layouts, after the phone sheet slot, never inside the desk page-body', () => {
    const desk = list.slice(list.indexOf('if (desk && rows.length > 0) {'), list.indexOf('  return (\n    <>\n      {header}\n      {/* `prd-shelf`'));
    expect(desk).toMatch(/<\/div>\s*<\/div>\s*\{\/\*[\s\S]*?\*\/\}\s*\{null\}\s*\{dialogs\}\s*<\/>/);
    expect(list.match(/\{dialogs\}/g)).toHaveLength(2);
  });
});
