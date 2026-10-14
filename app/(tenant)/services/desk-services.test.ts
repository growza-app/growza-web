import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-14 — Services on a wide desk is three panels: categories · the list · the service being edited.
 *
 * Source-pinned, like the booking desk's test: what is pinned is the wiring that makes it one screen rather than
 * three, which a refactor can silently undo while every unit test stays green.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const table = read('./ServicesTable.tsx');
const left = read('./DeskCategories.tsx');
const rows = read('./ServiceRows.tsx');
const form = read('./ServiceForm.tsx');
const css = read('../styles/79-desk-services.css');
const globals = read('../globals.css');

describe('the wide Services screen', () => {
  it('is only the desktop tier, and paints nothing until the width is known', () => {
    expect(table).toMatch(/window\.matchMedia\('\(min-width: 1101px\)'\)/);
    expect(table).toMatch(/if \(desk === null\)/);
    expect(table).toMatch(/<div className="page-body" aria-busy="true" \/>/);
  });

  it('is the three panels, in the till\'s grid', () => {
    expect(table).toMatch(/<div className="pf-wide-grid svc-desk-grid">/);
    expect(table).toMatch(/<DeskCategories[\s\S]*?onPick=\{setCategoryId\}/);
    expect(table).toMatch(/<section className="pf-wide-mid svc-desk-mid"/);
    expect(table).toMatch(/<aside className="pf-wide-right svc-desk-right"/);
  });

  it('lists every row of the tab with no pages, and a row opens the service on the right', () => {
    const desk = table.slice(table.indexOf('if (desk) {'), table.indexOf('return (\n    <>\n      {/*'));
    expect(desk).not.toMatch(/PaginatedTable|pageRows/);
    expect(desk).toMatch(/rows=\{ordered\}/);
    expect(desk).toMatch(/onSelect=\{\(s\) => \{\s*setCreating\(false\);\s*setEditing\(s\);/);
    expect(rows).toMatch(/onClick=\{onSelect \? \(\) => onSelect\(s\) : undefined\}/);
    // The ··· menu does not also open the row it sits on.
    expect(rows).toMatch(/className="dropdown-anchor svc-row-actions"[^>]*onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  });

  it('draws the sheet\'s own form in the panel, keyed by the service, and keeps it open after Save', () => {
    expect(table).toMatch(/serviceForm\(true\)/);
    expect(table).toMatch(/key=\{editing\?\.id \?\? 'new'\}/);
    expect(table).toMatch(/setEditing\(inline \? saved : null\)/);
    expect(form).toMatch(/inline \? 'sheet sheet-inline' : 'modal sheet'/);
    expect(form).toMatch(/if \(inline\) return sheet;/);
    expect(form).toMatch(/onClose: busy \|\| inline \? undefined : onClose/);
    // The bottom sheet is `position: fixed`; in the panel it must not be.
    expect(css).toMatch(/\.sheet-inline \{[^}]*position: static;/);
  });

  it('the left panel counts empty categories too, and manages them through the existing sheet', () => {
    expect(table).toMatch(/categories=\{deskCats \?\? categories\}/);
    expect(table).toMatch(/const categoryIds = useMemo\(\(\) => \(deskCats \?\? categories\)\.map/);
    expect(left).toMatch(/row\(ALL_TAB, t\('all'\), counts\.all\)/);
    expect(left).toMatch(/showRetired && row\(RETIRED_TAB/);
    // No writes of its own: adding goes through the screen, the rest through the sheet.
    expect(left).not.toMatch(/\bapi\./);
    expect(table).toMatch(/onManage=\{writable \? \(\) => void openManaging\(\) : undefined\}/);
  });

  it('the stylesheet is loaded after the till\'s, and the narrow end of the tier drops the Time column', () => {
    expect(globals.indexOf("79-desk-services.css")).toBeGreaterThan(globals.indexOf('79-desk-booking.css'));
    expect(css).toMatch(/@media \(min-width: 1101px\) and \(max-width: 1300px\) \{[\s\S]*td:nth-child\(2\) \{\s*display: none;/);
  });

  it('has its words in both languages', () => {
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(read(`../../../messages/${lang}.json`)) as { services: Record<string, string> };
      expect(m.services.deskPick).toBeTruthy();
      expect(m.services.deskShowing).toContain('{count');
    }
  });
});

describe('the categories dialog on a desk', () => {
  const dialog = read('./DeskCategoriesDialog.tsx');

  it('opens on the wide screen in place of the phone sheet, with the same writes', () => {
    expect(table).toMatch(/\{managing && desk && \(\s*<DeskCategoriesDialog/);
    expect(table).toMatch(/\{managing && !desk && \(\s*<CategoriesSheet/);
    for (const call of ['createCategory', 'renameCategory', 'reorderCategories', 'deleteServices', 'deleteCategory']) expect(dialog).toContain(`api.${call}(`);
  });

  it('has one state: every row carries its controls, and a delete asks in the row', () => {
    expect(dialog).not.toMatch(/mode === 'edit'|mode === 'pick'/);
    for (const aria of ['moveUpAria', 'moveDownAria', 'renameAria', 'deleteAria']) expect(dialog).toContain(`t('${aria}'`);
    expect(dialog).toMatch(/askingId === row\.id \? \(/);
    expect(css).toMatch(/\.svc-catd-row:hover \.svc-catd-actions,\s*\.svc-catd-row:focus-within \.svc-catd-actions/);
  });

  it('has its words in both languages', () => {
    for (const lang of ['en', 'hi']) {
      const m = JSON.parse(read(`../../../messages/${lang}.json`)) as { services: { categories: Record<string, string> } };
      for (const key of ['deskHint', 'deskOrderHint', 'deleteOne', 'deleteOneGoes', 'deleteOneEmpty', 'deleteAria']) expect(m.services.categories[key]).toBeTruthy();
    }
  });
});
