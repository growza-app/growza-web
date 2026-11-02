import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');

/** Owner, 2026-11-02 — a Menu category could be added and deleted but never renamed; and a dish's sheet showed two Save buttons. */
describe('Menu: renaming a category', () => {
  const dropdown = read('DeskProductCategories.tsx');
  const list = read('ProductsList.tsx');

  it('Edit offers a rename beside the delete, saved through the API', () => {
    expect(dropdown).toContain('onRename?: (c: ProductCategory, name: string) => Promise<void>');
    expect(dropdown).toContain("t('renameNamed', { name: c.name })");
    expect(list).toContain('api.renameProductCategory(branchId, c.id, name)');
    expect(list).toContain('onRename={writable ? renameCategory : undefined}');
  });

  it('the dishes carry the new name at once, without waiting for a reload', () => {
    expect(list).toContain('p.categoryId === updated.id ? { ...p, categoryName: updated.name } : p');
  });

  it('a rename is read-only for someone who cannot write', () => {
    expect(list).toContain('writable ? renameCategory : undefined');
  });
});

describe('Dish sheet: one Save', () => {
  const sheet = read('ProductSheet.tsx');
  it('the header no longer carries a Save; the footer does', () => {
    expect(sheet).not.toContain('sheet-head-save');
    expect(sheet).toContain('prd-footer-save');
  });
});
