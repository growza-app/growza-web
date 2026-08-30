import { Suspense } from 'react';

import { api, type ReportRangeKey, type ReportTabKey } from '../lib/api';
import { copy } from '../lib/copy';
import { ReportsClient, type TabPayload } from './ReportsClient';

export const dynamic = 'force-dynamic';

const TABS = new Set<string>([
  'overview', 'customers', 'revenue', 'bookings', 'services', 'staff', 'insights',
]);

const RANGES = new Set<string>([
  'today', 'last_7_days', 'this_month', 'last_month', 'last_3_months', 'this_year', 'custom',
]);

/** `custom` needs both ends; without them it is not a range, it is a typo. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reports (GRW-48).
 *
 * Server-rendered, one tab per request. Tab and range come from the URL, so a
 * report is a link somebody can send and the back button behaves — and
 * because the range is resolved once, server-side, every block on the page is
 * guaranteed to be describing the same days.
 *
 * A junk `?tab=` or `?range=` falls back rather than erroring: a stale
 * bookmark should still show a report.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string; compare?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const tab = (params.tab && TABS.has(params.tab) ? params.tab : 'overview') as ReportTabKey;
  const from = params.from && ISO_DATE.test(params.from) ? params.from : undefined;
  const to = params.to && ISO_DATE.test(params.to) ? params.to : undefined;
  const asked = params.range && RANGES.has(params.range) ? params.range : 'this_month';
  // A custom range without usable dates falls back rather than 400-ing the
  // whole page — but it must not silently render a *different* period under
  // the label of the one that was asked for, which is what dropping `custom`
  // on the floor used to do.
  const range = (asked === 'custom' && !(from && to) ? 'this_month' : asked) as ReportRangeKey;
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

  // Ranking providers against each other is a product smell in some verticals
  // — a clinic has no doctor leaderboard (07 §3.2). The tab is absent, and a
  // deep link to it lands somewhere real instead of on a 403.
  const staffTabAvailable = me.capabilities.staffLeaderboard;
  const resolvedTab = tab === 'staff' && !staffTabAvailable ? 'overview' : tab;

  // One tab's failure must not blank the page: the body renders its own error
  // state while the chrome above stays usable, so the owner can change the
  // range and try again.
  let payload: TabPayload = null;
  try {
    payload =
      resolvedTab === 'overview' ? { tab: 'overview', data: await api.reportsOverview(range, compare, from, to) }
      : resolvedTab === 'revenue' ? { tab: 'revenue', data: await api.reportsRevenue(range, compare, from, to) }
      : resolvedTab === 'bookings' ? { tab: 'bookings', data: await api.reportsBookings(range, compare, from, to) }
      : resolvedTab === 'services' ? { tab: 'services', data: await api.reportsServices(range, compare, from, to) }
      : resolvedTab === 'staff' ? { tab: 'staff', data: await api.reportsStaff(range, compare, from, to) }
      : resolvedTab === 'customers' ? { tab: 'customers', data: await api.reportsCustomers(range, compare, from, to) }
      : { tab: 'insights', data: await api.reportsInsights(range, compare, from, to) };
  } catch {
    payload = null;
  }

  return (
    <Suspense>
      <ReportsClient
        tab={resolvedTab}
        range={range}
        compare={compare}
        staffTabAvailable={staffTabAvailable}
        providerLabel={me.labels.providers ?? copy.nav.staff}
        labels={me.labels}
        payload={payload}
      />
    </Suspense>
  );
}
