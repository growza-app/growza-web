import { describe, expect, it } from 'vitest';
import { copyName, groupByCategory, timePhrase, worthGrouping } from './services-groups';

const svc = (name: string, categoryName: string | null) => ({ name, categoryName });

describe('arranging the list under headings', () => {
  const rows = [
    svc('Haircut', 'Hair'),
    svc('Facial', 'Skin'),
    svc('Beard Trim', 'Hair'),
    svc('Head Massage', null),
    svc('Clean-up', 'Skin'),
  ];

  it('gathers each category’s services under one heading', () => {
    const groups = groupByCategory(rows);
    expect(groups.map((g) => g.name)).toEqual(['Hair', 'Skin', null]);
    expect(groups[0]!.items.map((s) => s.name)).toEqual(['Haircut', 'Beard Trim']);
    expect(groups[1]!.items.map((s) => s.name)).toEqual(['Facial', 'Clean-up']);
  });

  /*
   * The order is the API's, which is the order the owner arranged in the Categories sheet and the order
   * customers meet when they book. Sorting alphabetically here would silently override that.
   */
  it('keeps the order the menu arrived in, not alphabetical order', () => {
    const reversed = groupByCategory([svc('Facial', 'Skin'), svc('Haircut', 'Hair')]);
    expect(reversed.map((g) => g.name)).toEqual(['Skin', 'Hair']);
  });

  it('puts the unfiled services last, under their own heading', () => {
    expect(groupByCategory(rows).at(-1)).toEqual({ name: null, items: [svc('Head Massage', null)] });
  });

  it('never drops a service', () => {
    const total = groupByCategory(rows).reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(rows.length);
  });

  it('an empty page is no groups, not one empty group', () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it('a branch where nothing is filed is one group, not none', () => {
    expect(groupByCategory([svc('Haircut', null)])).toEqual([{ name: null, items: [svc('Haircut', null)] }]);
  });
});

describe('whether headings are worth drawing', () => {
  it('two categories: yes', () => {
    expect(worthGrouping(groupByCategory([svc('A', 'Hair'), svc('B', 'Skin')]))).toBe(true);
  });

  /** On a category's own tab every row shares a heading, and the tab already says which. */
  it('one category: no — the tab already said it', () => {
    expect(worthGrouping(groupByCategory([svc('A', 'Hair'), svc('B', 'Hair')]))).toBe(false);
  });

  it('nothing at all: no', () => {
    expect(worthGrouping(groupByCategory([]))).toBe(false);
  });

  /** One real category plus the unfiled ones IS two groups — the owner should see what is unfiled. */
  it('one category and something unfiled: yes', () => {
    expect(worthGrouping(groupByCategory([svc('A', 'Hair'), svc('B', null)]))).toBe(true);
  });
});

describe('how long it takes, as one phrase', () => {
  const minutes = (count: number) => `${count} min`;
  const cleanup = (count: number) => `+${count} cleanup`;

  /** The unit is said once — "+10 min cleanup" wrapped to a second line on a phone and squeezed the name. */
  it('says the duration and the cleanup held after it', () => {
    expect(timePhrase({ durationMin: 30, bufferAfterMin: 10 }, minutes, cleanup)).toBe('30 min · +10 cleanup');
  });

  /** The reason the two columns merged: "+0 cleanup" on half the rows is a column the owner learns to skip. */
  it('says nothing about cleanup when there is none', () => {
    expect(timePhrase({ durationMin: 30, bufferAfterMin: 0 }, minutes, cleanup)).toBe('30 min');
  });

  it('treats a negative cleanup as none rather than printing it', () => {
    expect(timePhrase({ durationMin: 30, bufferAfterMin: -5 }, minutes, cleanup)).toBe('30 min');
  });

  it('a long service still reads as one phrase', () => {
    expect(timePhrase({ durationMin: 120, bufferAfterMin: 15 }, minutes, cleanup)).toBe('120 min · +15 cleanup');
  });
});

describe('naming a copy', () => {
  const suffix = (name: string) => `${name} (copy)`;

  it('is the original with (copy) after it', () => {
    expect(copyName('Haircut', ['Haircut'], suffix)).toBe('Haircut (copy)');
  });

  /** Numbered only once it has to be — "(copy 1)" on the first duplicate reads like a mistake. */
  it('numbers only the second copy onward', () => {
    expect(copyName('Haircut', ['Haircut', 'Haircut (copy)'], suffix)).toBe('Haircut (copy) 2');
    expect(copyName('Haircut', ['Haircut', 'Haircut (copy)', 'Haircut (copy) 2'], suffix)).toBe('Haircut (copy) 3');
  });

  /** Two services differing only in case are the same service to the owner reading the list. */
  it('does not hand back a name that differs only in case', () => {
    expect(copyName('Haircut', ['haircut (COPY)'], suffix)).toBe('Haircut (copy) 2');
  });

  it('ignores the spacing around an existing name', () => {
    expect(copyName('Haircut', ['  Haircut (copy)  '], suffix)).toBe('Haircut (copy) 2');
  });

  it('a branch with nothing in it still names the copy', () => {
    expect(copyName('Haircut', [], suffix)).toBe('Haircut (copy)');
  });
});
