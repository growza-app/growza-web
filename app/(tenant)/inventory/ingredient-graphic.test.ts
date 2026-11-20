import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { groupHues, groupKey, groupNames, ingredientGraphic, stockLevel } from './ingredient-graphic';

describe("an ingredient's drawing (owner, 2026-11-20)", () => {
  const kind = (name: string, category?: string) => ingredientGraphic({ name, category });

  it('reads the name first: eggs sit in Meat & fish, ghee is dairy but poured', () => {
    expect(kind('Eggs', 'Meat & fish')).toBe('egg');
    expect(kind('Fish (surmai)', 'Meat & fish')).toBe('fish');
    expect(kind('Chicken (boneless)', 'Meat & fish')).toBe('drumstick');
    expect(kind('Ghee', 'Dairy')).toBe('oil');
    expect(kind('Green Chilli', 'Vegetables')).toBe('chili');
    expect(kind('Hakka Noodles', 'Rice, flour and dal')).toBe('noodles');
    expect(kind('Basmati Rice', 'Rice, flour and dal')).toBe('grain');
    expect(kind('Takeaway Box', 'Packing')).toBe('box');
    // A row with no group (the report's) still knows a vegetable by its name.
    expect(kind('Spinach')).toBe('leaf');
    expect(kind('Tomato')).toBe('leaf');
    expect(kind('Coriander')).toBe('leaf');
  });

  it("then the owner's own group words, then a jar", () => {
    expect(kind('Khoya', 'Dairy')).toBe('milk');
    expect(kind('Onion', 'Vegetables')).toBe('leaf');
    expect(kind('Turmeric', 'Spices')).toBe('chili');
    expect(kind('Sugar', 'Groceries')).toBe('jar');
    expect(kind('Something', null as unknown as undefined)).toBe('jar');
  });
});

describe('group colours', () => {
  it('go A–Z through the six section hues, the seventh starting again, and skip items in no group', () => {
    const h = groupHues(['Vegetables', 'Dairy', null, ' Dairy ', 'A', 'B', 'C', 'D', 'E']);
    expect(h.get('a')).toBe(1);
    expect(h.get('dairy')).toBe(5);
    expect(h.get('e')).toBe(6);
    expect(h.get('vegetables')).toBe(1);
    expect(h.has('')).toBe(false);
  });

  it('"Dairy" and "dairy " are one group, kept as first typed (owner, 2026-11-21)', () => {
    const names = groupNames(['Dairy', 'dairy ', 'DAIRY', 'Spices', null, '  ']);
    expect([...names.values()]).toEqual(['Dairy', 'Spices']);
    expect(groupKey(' Dairy ')).toBe('dairy');
    expect(groupHues(['Dairy', 'dairy']).size).toBe(1);
  });

  it('each hue has its rule in the inventory sheet', () => {
    const css = readFileSync(new URL('../styles/99-inventory.css', import.meta.url), 'utf8');
    for (let n = 1; n <= 6; n++) expect(css).toContain(`.ks-table [data-hue='${n}'] { --sec: var(--cat-${n}); }`);
  });
});

describe('the stock level', () => {
  it('runs to three times the low line, and has nothing to measure against without one', () => {
    expect(stockLevel(3, 1)).toBe(1);
    expect(stockLevel(1, 1)).toBeCloseTo(1 / 3);
    expect(stockLevel(9, 1)).toBe(1);
    expect(stockLevel(0, 1)).toBe(0);
    expect(stockLevel(5, 0)).toBeNull();
  });
});
