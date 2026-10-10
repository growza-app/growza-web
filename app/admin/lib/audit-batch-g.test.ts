import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countDelta, lastMonthFigure, percentDelta, SAME_DAY_LAST_MONTH } from '../components/DashboardParts';
import { SUBSCRIPTION_VIEWS } from './subscription-status';
import { applyPersonFilters, NAME_SEARCH_DEBOUNCE_MS, NAME_SEARCH_UNSUPPORTED } from './audit-person-filter';

/**
 * Admin portal audit, batch G (2026-10-09) — the dashboard and monitoring figures.
 *
 * The delta helpers run for real; the screens are source-reading, as elsewhere in this suite (no DOM).
 */
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('M10 — a dashboard tile opens the rows it counted', () => {
  it('the list knows both views the API filters by', () => {
    expect(Object.keys(SUBSCRIPTION_VIEWS).sort()).toEqual(['cancelled_this_month', 'uninvoiced']);
  });

  it('reads ?view= from the URL, sends it, and offers Show all', () => {
    const page = read('subscriptions/page.tsx');
    expect(page).toMatch(/const viewParam = searchParams\.get\('view'\);/);
    expect(page).toMatch(/if \(view\) params\.set\('view', view\);/);
    expect(page).toMatch(/onClick=\{\(\) => router\.replace\('\/admin\/subscriptions'\)\}/);
    expect(page).toMatch(/<Suspense>\s*<SubscriptionsList \/>\s*<\/Suspense>/);
  });
});

describe('M11 — "vs last month" compares the same span', () => {
  it('says what it compares against', () => {
    expect(percentDelta(120, 100)?.text).toBe(`20% ${SAME_DAY_LAST_MONTH}`);
    expect(countDelta(5, 3).text).toBe(`2 ${SAME_DAY_LAST_MONTH}`);
    expect(countDelta(3, 3)).toEqual({ direction: 'flat', text: `no change ${SAME_DAY_LAST_MONTH}` });
  });

  it('uses last month up to the same day when the API sends it', () => {
    expect(lastMonthFigure(40, 900)).toEqual({ previous: 40, against: SAME_DAY_LAST_MONTH });
  });

  it('falls back to the whole month from an older API — and says "vs last month", not a claim it cannot back', () => {
    expect(lastMonthFigure(undefined, 900)).toEqual({ previous: 900, against: 'vs last month' });
  });

  it('every month-on-month card uses it; Total businesses says "since the 1st"', () => {
    const page = read('page.tsx');
    expect(page).toMatch(/lastMonthFigure\(data\.newBusinesses\.previousToDate, data\.newBusinesses\.previous\)/);
    expect(page).toMatch(/lastMonthFigure\(data\.revenue\.previousToDateMinor, data\.revenue\.previousMonthMinor\)/);
    expect(page).toMatch(/percentDelta\(data\.totalBusinesses, data\.totalAtPeriodStart, SINCE_THE_FIRST\)/);
    expect(read('components/DashboardParts.tsx')).toMatch(/lastMonthFigure\(bookings\.previousToDate, bookings\.previousMonth\)/);
  });
});

describe('M12 — given-up outbox rows', () => {
  it('turn the Failing tile red on their own — they are no longer counted as failing', () => {
    const page = read('network-monitoring/page.tsx');
    expect(page).toMatch(/bad=\{w\.failing > 0 \|\| w\.givenUp > 0\}/);
    expect(page).toMatch(/given up — will not be retried/);
  });
});

describe('L8 — Usage', () => {
  const page = read('usage/page.tsx');
  it('counts a business on a limit of 0 as at its limit', () => {
    expect(page).toMatch(/return b && b\.limit !== null && b\.used >= b\.limit;/);
    expect(page).not.toMatch(/b\.limit > 0/);
  });
  it('says where the ranking by share of limit stops', () => {
    expect(page).toMatch(/page\?\.rankedCount !== undefined && page\.total > page\.rankedCount \?/);
  });
});

describe('L9 — the Audit log filters take a name', () => {
  const list = read('components/AuditLogList.tsx');
  it('Admin and Business are searched by name, not by a UUID', () => {
    expect(list).toMatch(/placeholder="Name or phone" value=\{filters\.actor\}/);
    expect(list).toMatch(/placeholder="Business name" value=\{filters\.business\}/);
    expect(list).toMatch(/const byName = applyPersonFilters\(params, nameQuery\);/);
    expect(list).not.toMatch(/Platform user ID/);
  });
  it('old links carrying actorId / tenantId still filter', () => {
    expect(list).toMatch(/actor: params\.get\('actor'\) \?\? params\.get\('actorId'\) \?\? ''/);
    expect(list).toMatch(/business: params\.get\('business'\) \?\? params\.get\('tenantId'\) \?\? ''/);
  });
});

describe('L9 review fixes — the Admin and Business boxes', () => {
  const list = read('components/AuditLogList.tsx');
  const sent = (actor: string, business = '') => {
    const params = new URLSearchParams();
    const byName = applyPersonFilters(params, { actor, business });
    return { byName, query: params.toString() };
  };

  it('a name goes as actor / business; an id as the actorId / tenantId every API reads', () => {
    expect(sent(' asha ')).toEqual({ byName: true, query: 'actor=asha' });
    expect(sent('', 'Glow')).toEqual({ byName: true, query: 'business=Glow' });
    expect(sent('11111111-1111-4111-8111-00000000d001', '22222222-2222-4222-8222-00000000d002')).toEqual({
      byName: false,
      query: 'actorId=11111111-1111-4111-8111-00000000d001&tenantId=22222222-2222-4222-8222-00000000d002',
    });
    // A half-typed id is a search, as the API treats it.
    expect(sent('11111111-1111')).toEqual({ byName: true, query: 'actor=11111111-1111' });
    expect(sent('  ', '')).toEqual({ byName: false, query: '' });
  });

  it('searches once typing settles, not per keystroke', () => {
    expect(NAME_SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(250);
    expect(list).toMatch(/setTimeout\(\(\) => \{[\s\S]*?setNameQuery\([\s\S]*?\}, NAME_SEARCH_DEBOUNCE_MS\);/);
    // The fetch reads the settled search, not the box; and typing does not reset paging (which would refetch).
    expect(list).toMatch(/\}, \[filters\.action, filters\.entityType, filters\.tenantId, filters\.from, filters\.to, nameQuery, paging\]\);/);
    expect(list).toMatch(/if \(key !== 'actor' && key !== 'business'\) setPaging/);
  });

  it('an API that ignored a name search is not shown as a filtered list', () => {
    expect(list).toMatch(/if \(byName && !result\.searchesByName\) \{\s*setPage\(null\);\s*setRows\(\[\]\);\s*setError\(NAME_SEARCH_UNSUPPORTED\);/);
    expect(NAME_SEARCH_UNSUPPORTED).toMatch(/Paste the full id/);
  });
});

describe('M10 review fix — the view empty state', () => {
  it('says "None right now" only for the view alone; with a status, Discounted or search on top it is "No match"', () => {
    const page = read('subscriptions/page.tsx');
    expect(page).toMatch(/view && status === 'All' && !discountedOnly && trimmedSearch\.length < 2 \? \(\s*\/\/[^\n]*\n[^\n]*\n\s*<EmptyState icon="subs" title="None right now"/);
    expect(page).toMatch(/\) : hasActiveFilters \? \(\s*<EmptyState icon="subs" title="No subscriptions match"/);
  });
});
