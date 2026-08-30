import { Suspense } from 'react';

import { api, type ReportOverview, type ReportRangeKey, type ReportTabKey } from '../lib/api';
import { copy } from '../lib/copy';
import { ReportsClient } from './ReportsClient';

export const dynamic = 'force-dynamic';

const TABS = new Set<string>([
  'overview',
  'customers',
  'revenue',
  'bookings',
  'services',
  'staff',
  'retention',
  'insights',
]);

const RANGES = new Set<string>([
  'today',
  'last_7_days',
  'this_month',
  'last_month',
  'last_3_months',
  'this_year',
]);

/**
 * Reports (GRW-48).
 *
 * Rendered on the server, one tab per request. Tab and range come from the
 * URL, so a report is a link somebody can send and a back button behaves; and
 * because the range is resolved once, server-side, every block on the page is
 * guaranteed to be describing the same days.
 *
 * A junk `?tab=` or `?range=` falls back rather than erroring — a stale
 * bookmark should still show a report.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string; compare?: string }>;
}) {
  const params = await searchParams;
  const tab = (params.tab && TABS.has(params.tab) ? params.tab : 'overview') as ReportTabKey;
  const range = (params.range && RANGES.has(params.range) ? params.range : 'this_month') as ReportRangeKey;
  const compare = params.compare !== 'false';

  let me;
  try {
    me = await api.me();
  } catch {
    return (
      <div className="page-body">
        <div className="banner">
          <strong>{copy.errors.apiDown}</strong> {copy.errors.apiDownHelp} <code>npm run dev</code>.
        </div>
      </div>
    );
  }

  // Ranking providers against each other is off for verticals where it is a
  // product smell — a clinic does not have a doctor leaderboard (07 §3.2).
  const staffTabAvailable = me.capabilities.staffLeaderboard;
  const resolvedTab = tab === 'staff' && !staffTabAvailable ? 'overview' : tab;

  // One block failing must not blank the page: the tab renders its own error
  // state and the chrome above it stays usable, so the owner can change the
  // range and try again.
  let overview: ReportOverview | null = null;
  if (resolvedTab === 'overview') {
    try {
      overview = await api.reportsOverview(range, compare);
    } catch {
      overview = null;
    }
  }

  return (
    <Suspense>
      <ReportsClient
        tab={resolvedTab}
        range={range}
        compare={compare}
        staffTabAvailable={staffTabAvailable}
        overview={overview}
      />
    </Suspense>
  );
}
