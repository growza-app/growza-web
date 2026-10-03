import { describe, expect, it } from 'vitest';
import { movedOrder, unsorted, worthOrdering } from './category-order';

const rows = ['Hair', 'Skin', 'Nails', 'Spa'];

describe('moving a category', () => {
  it('to the top', () => {
    expect(movedOrder(rows, 2, 0)).toEqual(['Nails', 'Hair', 'Skin', 'Spa']);
  });

  it('to the end', () => {
    expect(movedOrder(rows, 0, 3)).toEqual(['Skin', 'Nails', 'Spa', 'Hair']);
  });

  it('one place down — the arrow’s move', () => {
    expect(movedOrder(rows, 0, 1)).toEqual(['Skin', 'Hair', 'Nails', 'Spa']);
  });

  /** A drag that ends where it started should not cost a round trip or a flash of reordering. */
  it('onto itself changes nothing', () => {
    expect(movedOrder(rows, 1, 1)).toEqual(rows);
  });

  it('past either end changes nothing rather than dropping a row', () => {
    expect(movedOrder(rows, 0, 9)).toEqual(rows);
    expect(movedOrder(rows, -1, 2)).toEqual(rows);
    expect(movedOrder(rows, 2, -1)).toEqual(rows);
  });

  it('never loses or duplicates a category', () => {
    const out = movedOrder(rows, 3, 1);
    expect([...out].sort()).toEqual([...rows].sort());
    expect(out).toHaveLength(rows.length);
  });

  it('does not mutate what it was given', () => {
    const before = [...rows];
    movedOrder(rows, 0, 3);
    expect(rows).toEqual(before);
  });

  it('a list of one has nowhere to move to', () => {
    expect(movedOrder(['Hair'], 0, 0)).toEqual(['Hair']);
  });
});

describe('whether ordering is offered at all', () => {
  it('two or more: yes', () => {
    expect(worthOrdering(rows)).toBe(true);
    expect(worthOrdering(['Hair', 'Skin'])).toBe(true);
  });

  /** A handle, two arrows and a sentence about customer order, above a list of one, change nothing. */
  it('one: no', () => {
    expect(worthOrdering(['Hair'])).toBe(false);
  });

  it('none: no', () => {
    expect(worthOrdering([])).toBe(false);
  });
});

describe('the services filed under nothing', () => {
  const services = [
    { id: 's1', categoryId: 'c1' },
    { id: 's2', categoryId: null },
    { id: 's3', categoryId: 'c2' },
    { id: 's4', categoryId: null },
  ];

  it('are picked out, in the order they came', () => {
    expect(unsorted(services).map((s) => s.id)).toEqual(['s2', 's4']);
  });

  it('a branch where everything is filed has none', () => {
    expect(unsorted(services.filter((s) => s.categoryId !== null))).toEqual([]);
  });

  it('a branch with no services at all has none', () => {
    expect(unsorted([])).toEqual([]);
  });
});
