import { Suspense } from 'react';

import {
  api,
  isFilterableReportTab,
  type ReportFilterOptions,
  type ReportFilters,
  type ReportRangeKey,
  type ReportTabKey,
} from '../lib/api';
import { copy } from '../lib/copy';
import { ReportsClient, type TabPayload } from './ReportsClient';

export const dynamic = 'force-dynamic';

const TABS = new Set<string>([
  'overview', 'customers', 'revenue', 'bookings', 'services', 'staff',
]);

const RANGES = new Set<string>([
  'today', 'last_7_days', 'this_month', 'last_month', 'last_3_months', 'this_year', 'custom',
]);

/** `custom` needs both ends; without them it is not a range, it is a typo. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What the range actually resolved to, for the download's filename. */
function rangeLabelOf(payload: TabPayload): string | undefined {
  return payload?.data.range.label;
}

/** The statuses a filter may name — the same vocabulary `copy.status` renders. */
const FILTER_STATUSES = new Set(['confirmed', 'completed', 'cancelled', 'no_show']);

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
  searchParams: Promise<{
    tab?: string;
    range?: string;
    compare?: string;
    from?: string;
    to?: string;
    providerId?: string | string[];
    serviceId?: string | string[];
    status?: string | string[];
  }>;
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

  // The Filters drawer's selections (GRW-60). Read here rather than in the
  // client so the first render is already narrowed — a report that flashes
  // its unfiltered figures before correcting itself has shown the owner a
  // number that was never the answer to their question.
  const asList = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value : value === undefined ? [] : [value];
  const askedFilters: ReportFilters = {
    providerIds: asList(params.providerId),
    serviceIds: asList(params.serviceId),
    statuses: asList(params.status).filter((s) => FILTER_STATUSES.has(s)),
  };

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
  /**
   * What the drawer may offer, and the truth against which URL ids are judged.
   *
   * An id the tenant does not own — a stale bookmark, a service since deleted,
   * a hand-edited link — is dropped here rather than passed through. Passed
   * through it would simply match no rows, and the owner would be looking at
   * an empty report with a chip claiming a filter that does not exist.
   */
  let filterOptions: ReportFilterOptions = { providers: [], services: [] };
  try {
    filterOptions = await api.reportFilterOptions();
  } catch {
    // The drawer degrades to unavailable rather than taking the page with it.
  }
  const ownedProviders = new Set(filterOptions.providers.map((p) => p.id));
  const ownedServices = new Set(filterOptions.services.map((s) => s.id));
  const filters: ReportFilters = {
    providerIds: askedFilters.providerIds.filter((id) => ownedProviders.has(id)),
    serviceIds: askedFilters.serviceIds.filter((id) => ownedServices.has(id)),
    statuses: askedFilters.statuses,
  };
  const droppedFilters =
    askedFilters.providerIds.length - filters.providerIds.length +
    (askedFilters.serviceIds.length - filters.serviceIds.length);

  // Only the tabs a filter can honestly narrow are sent one. The rest keep the
  // params in the URL — so switching back restores the filter — but report
  // unnarrowed figures and say so rather than implying a filter is in force.
  const applied = isFilterableReportTab(resolvedTab) ? filters : undefined;

  let payload: TabPayload = null;
  try {
    payload =
      resolvedTab === 'overview' ? { tab: 'overview', data: await api.reportsOverview(range, compare, from, to) }
      : resolvedTab === 'revenue' ? { tab: 'revenue', data: await api.reportsRevenue(range, compare, from, to, applied) }
      : resolvedTab === 'bookings' ? { tab: 'bookings', data: await api.reportsBookings(range, compare, from, to, applied) }
      : resolvedTab === 'services' ? { tab: 'services', data: await api.reportsServices(range, compare, from, to, applied) }
      : resolvedTab === 'staff' ? { tab: 'staff', data: await api.reportsStaff(range, compare, from, to, applied) }
      : { tab: 'customers', data: await api.reportsCustomers(range, compare, from, to) };
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
        filters={filters}
        filterOptions={filterOptions}
        droppedFilters={droppedFilters}
        providerLabel={me.labels.providers ?? copy.nav.staff}
        tenantName={me.tenant?.name ?? 'growza'}
        rangeLabel={rangeLabelOf(payload) ?? range}
        labels={me.labels}
        payload={payload}
      />
    </Suspense>
  );
}
