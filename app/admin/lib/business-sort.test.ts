import { describe, expect, it } from 'vitest';
import { DEFAULT_BUSINESS_SORT, isDefaultSort, MOBILE_SORT_OPTIONS, nextSort, sortFromOption, sortFromParams } from './business-sort';
import { BUSINESS_COLUMNS } from './list-columns';

const p = (q: string) => new URLSearchParams(q);

/** Jira GRW-693 — sorting the Businesses list. */
describe('the Businesses list order', () => {
  it('opens newest first, and an unknown sort in a link falls back to it', () => {
    expect(sortFromParams(p(''))).toEqual(DEFAULT_BUSINESS_SORT);
    expect(sortFromParams(p('sort=revenue&dir=asc'))).toEqual(DEFAULT_BUSINESS_SORT);
  });

  it('AC-01 — survives a reload: the URL gives back the same key and direction', () => {
    expect(sortFromParams(p('sort=plan&dir=desc'))).toEqual({ key: 'plan', dir: 'desc' });
    expect(sortFromParams(p('sort=name'))).toEqual({ key: 'name', dir: 'asc' });
  });

  it('AC-01 — a press sorts by that column; a second press reverses it', () => {
    const byPlan = nextSort(DEFAULT_BUSINESS_SORT, 'plan');
    expect(byPlan).toEqual({ key: 'plan', dir: 'asc' });
    expect(nextSort(byPlan, 'plan')).toEqual({ key: 'plan', dir: 'desc' });
    expect(nextSort(byPlan, 'created')).toEqual({ key: 'created', dir: 'desc' });
  });

  it('only the default leaves the URL clean', () => {
    expect(isDefaultSort(DEFAULT_BUSINESS_SORT)).toBe(true);
    expect(isDefaultSort({ key: 'created', dir: 'asc' })).toBe(false);
  });

  it('the headings that sort are Business, Plan, Status and Created', () => {
    expect(BUSINESS_COLUMNS.filter((c) => c.sortKey).map((c) => [c.label, c.sortKey])).toEqual([
      ['Business', 'name'],
      ['Plan', 'plan'],
      ['Status', 'status'],
      ['Created', 'created'],
    ]);
  });

  it('AC-03 — the phone menu offers every order, and each reads back to itself', () => {
    for (const o of MOBILE_SORT_OPTIONS) {
      const s = sortFromOption(o.value);
      expect(`${s.key}:${s.dir}`).toBe(o.value);
    }
    expect(sortFromOption('nonsense')).toEqual(DEFAULT_BUSINESS_SORT);
  });
});
