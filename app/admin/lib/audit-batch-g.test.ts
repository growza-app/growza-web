import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countDelta, lastMonthFigure, percentDelta, SAME_DAY_LAST_MONTH } from '../components/DashboardParts';
import { SUBSCRIPTION_VIEWS } from './subscription-status';

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
    expect(list).toMatch(/params\.set\('actor', filters\.actor\.trim\(\)\)/);
    expect(list).toMatch(/params\.set\('business', filters\.business\.trim\(\)\)/);
    expect(list).not.toMatch(/Platform user ID/);
  });
  it('old links carrying actorId / tenantId still filter', () => {
    expect(list).toMatch(/actor: params\.get\('actor'\) \?\? params\.get\('actorId'\) \?\? ''/);
    expect(list).toMatch(/business: params\.get\('business'\) \?\? params\.get\('tenantId'\) \?\? ''/);
  });
});
