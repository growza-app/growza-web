import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rankIngredients } from './IngredientPicker';

const item = (name: string, category: string | null = null) => ({ id: name, name, category });
const pantry = [item('Kasuri Methi', 'Spices'), item('Methi Leaves', 'Vegetables'), item('Garam Masala', 'Spices'), item('Chicken (boneless)', 'Meat & fish'), item('Chicken', 'Meat & fish')];

describe('owner, 2026-11-20 — Add ingredient is a search, not a sixty-line select', () => {
  it('nothing typed lists every item A to Z', () => {
    expect(rankIngredients(pantry, '').map((m) => m.name)).toEqual(['Chicken', 'Chicken (boneless)', 'Garam Masala', 'Kasuri Methi', 'Methi Leaves']);
  });

  it('a name that starts with what is typed comes first, then a word in it, then anywhere, then the group', () => {
    expect(rankIngredients(pantry, 'methi').map((m) => m.name)).toEqual(['Methi Leaves', 'Kasuri Methi']);
    expect(rankIngredients(pantry, 'bone').map((m) => m.name)).toEqual(['Chicken (boneless)']);
    expect(rankIngredients(pantry, 'spice').map((m) => m.name)).toEqual(['Garam Masala', 'Kasuri Methi']);
    expect(rankIngredients(pantry, '  CHICK ').map((m) => m.name)).toEqual(['Chicken', 'Chicken (boneless)']);
  });

  it('nothing matching is said, not an empty box', () => {
    expect(rankIngredients(pantry, 'zzz')).toEqual([]);
    const src = readFileSync(resolve(__dirname, 'IngredientPicker.tsx'), 'utf8');
    expect(src).toContain("t('noMatch', { q: query.trim() })");
  });

  it('is a combobox: arrows, Enter, Escape that closes only the list, and a tap not lost to the blur', () => {
    const src = readFileSync(resolve(__dirname, 'IngredientPicker.tsx'), 'utf8');
    expect(src).toContain('role="combobox"');
    expect(src).toContain('role="listbox"');
    expect(src).toContain("e.key === 'Enter' && activeIdx >= 0");
    expect(src).toMatch(/e\.key === 'Escape'\) \{[\s\S]{0,200}e\.stopPropagation\(\);\s*setOpen\(false\);/);
    expect(src).toContain('onPointerDown={(e) => e.preventDefault()}');
  });

  it('the recipe editor uses it instead of the select', () => {
    const panel = readFileSync(resolve(__dirname, 'RecipePanel.tsx'), 'utf8');
    expect(panel).toContain('<IngredientPicker');
    expect(panel).not.toContain('className="prd-input rc-add"');
  });
});
