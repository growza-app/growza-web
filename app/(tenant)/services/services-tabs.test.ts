import { describe, expect, it } from 'vitest';
import {
  ALL_TAB,
  RETIRED_TAB,
  hasRetired,
  servicesOnTab,
  tabAfterChange,
  tabCounts,
  type TabbableService,
} from './services-tabs';

const svc = (name: string, active: boolean, categoryId: string | null = null) =>
  ({ name, active, categoryId }) as TabbableService & { name: string };

const HAIR = 'c1111111-1111-1111-1111-111111111111';
const SKIN = 'c2222222-2222-2222-2222-222222222222';

/** The shape that prompted the story: four on the menu, the rest taken off it. */
const branch = [
  svc('Haircut', true, HAIR),
  svc('Beard Trim', true, HAIR),
  svc('Facial', true, SKIN),
  svc('Head Massage', true, null),
  svc('Cleanup', false, SKIN),
  svc('Bleach', false, SKIN),
  svc('De-Tan', false, null),
];

describe('which services a tab shows', () => {
  it('All is the menu being sold, not everything the branch has ever had', () => {
    const names = servicesOnTab(branch, ALL_TAB).map((s) => s.name);
    expect(names).toEqual(['Haircut', 'Beard Trim', 'Facial', 'Head Massage']);
    expect(names).not.toContain('Cleanup');
  });

  it('a category shows only its live services', () => {
    expect(servicesOnTab(branch, SKIN).map((s) => s.name)).toEqual(['Facial']);
  });

  it('Retired is flat — every retired service, whatever category it was in', () => {
    // Cleanup and Bleach are Skin, De-Tan has no category: the drawer is not split by category.
    expect(servicesOnTab(branch, RETIRED_TAB).map((s) => s.name)).toEqual(['Cleanup', 'Bleach', 'De-Tan']);
  });

  it('a service with no category still counts as on the menu', () => {
    expect(servicesOnTab(branch, ALL_TAB).map((s) => s.name)).toContain('Head Massage');
  });

  it('an unknown tab shows nothing rather than everything', () => {
    // A category deleted in the sheet while its tab was selected must not fall through to "show all".
    expect(servicesOnTab(branch, 'c9999999-9999-9999-9999-999999999999')).toEqual([]);
  });
});

describe('what each count says', () => {
  it('every count equals the rows its tab lists', () => {
    const counts = tabCounts(branch);
    expect(counts.all).toBe(servicesOnTab(branch, ALL_TAB).length);
    expect(counts.retired).toBe(servicesOnTab(branch, RETIRED_TAB).length);
    expect(counts.byCategory.get(HAIR)).toBe(servicesOnTab(branch, HAIR).length);
    expect(counts.byCategory.get(SKIN)).toBe(servicesOnTab(branch, SKIN).length);
  });

  it('retiring a service moves it between the counts — the thing that used to change nothing', () => {
    const before = tabCounts(branch);
    const after = tabCounts(branch.map((s) => (s.name === 'Facial' ? { ...s, active: false } : s)));
    expect(after.all).toBe(before.all - 1);
    expect(after.retired).toBe(before.retired + 1);
    expect(after.byCategory.get(SKIN) ?? 0).toBe(0);
  });

  it('a category whose services are all retired counts 0, not its membership', () => {
    const allSkinRetired = branch.map((s) => (s.categoryId === SKIN ? { ...s, active: false } : s));
    expect(tabCounts(allSkinRetired).byCategory.get(SKIN) ?? 0).toBe(0);
  });
});

describe('when the Retired tab is offered', () => {
  it('is offered when something is retired', () => {
    expect(hasRetired(branch)).toBe(true);
  });

  it('is not offered on a branch that has never retired anything', () => {
    expect(hasRetired(branch.filter((s) => s.active))).toBe(false);
  });

  it('every service retired: All is empty and Retired holds them all', () => {
    const none = branch.map((s) => ({ ...s, active: false }));
    expect(servicesOnTab(none, ALL_TAB)).toEqual([]);
    expect(servicesOnTab(none, RETIRED_TAB)).toHaveLength(branch.length);
    expect(tabCounts(none).all).toBe(0);
  });
});

describe('standing on a tab that goes away', () => {
  it('restoring the last retired service moves the owner back to All', () => {
    const nothingRetired = branch.map((s) => ({ ...s, active: true }));
    expect(tabAfterChange(nothingRetired, RETIRED_TAB)).toBe(ALL_TAB);
  });

  it('leaves the tab alone while there is still something retired', () => {
    expect(tabAfterChange(branch, RETIRED_TAB)).toBe(RETIRED_TAB);
  });

  it('never moves the owner off All or off a category', () => {
    expect(tabAfterChange(branch, ALL_TAB)).toBe(ALL_TAB);
    expect(tabAfterChange(branch, HAIR)).toBe(HAIR);
  });
});
