import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const list = readFileSync(resolve(__dirname, 'ProductsList.tsx'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8'));

/** Develop QA 2026-11-21, finding 7 — the take-off line mentions a recipe only when the dish has one. */
describe('taking a dish off the menu says what it keeps', () => {
  it('a dish with no recipe keeps its bills; one with a recipe keeps both', () => {
    expect(list).toContain("(recipes?.get(p.id)?.state ?? 'none') !== 'none'");
    expect(list).toContain("tm('takenOffNoRecipe', { name: updated.name })");
    for (const m of [en, hi]) {
      expect(m.products.menu.takenOffNoRecipe).toContain('{name}');
      expect(m.products.menu.takenOffDone).toContain('{name}');
    }
    expect(en.products.menu.takenOffNoRecipe).not.toContain('recipe');
  });
});
