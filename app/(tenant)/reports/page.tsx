import { getTranslations } from 'next-intl/server';
import { guardLive } from '../lib/screen-guard';
import { screenTitle } from '../lib/page-title';
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
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind, type LoadErrorKind } from '../lib/load-error';
import { ReportsClient, type TabPayload } from './ReportsClient';

/**
 * The Reports screen's tabs, in its own order. Mirrors `REPORT_TABS` on the
 * server (`api/security/report-access.ts`) — the setting, the API and this
 * screen have to name the same six things or an owner ticks a box that grants
 * nothing.
 */
const ALL_REPORT_TABS = ['overview', 'customers', 'revenue', 'bookings', 'services', 'staff'] as const;

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
    /** Jira GRW-238 — one branch of a multi-branch business. */
    branch?: string;
  }>;
}) {
  // Jira GRW-556 — this screen opens at go-live; before it, say so rather than draw what the API would refuse.
  await guardLive('/reports');
  const t = await getTranslations('reports');
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
  } catch (error) {
    return (
      <div className="page-body">
        <LoadErrorBanner kind={loadErrorKind(error)} />
      </div>
    );
  }

  // Ranking providers against each other is a product smell in some verticals
  // — a clinic has no doctor leaderboard (07 §3.2). The tab is absent, and a
  // deep link to it lands somewhere real instead of on a 403.
  const staffTabAvailable = me.capabilities.staffLeaderboard;

  /**
   * Jira GRW-63 · GRW-197 — the tabs this caller may open at all.
   *
   * Absent means every tab, which is the pre-GRW-197 behaviour and the answer
   * for an owner or manager. A limited role gets exactly what the salon
   * granted, already narrowed to their own role by `/me`.
   *
   * Two gates, not one: `staffTabAvailable` is a VERTICAL question (a clinic
   * has no doctor leaderboard) and this is a PERMISSION question. Collapsing
   * them would make a salon's grant able to conjure a tab the vertical does
   * not have.
   */
  const allowedTabs = me.reportTabs ?? [...ALL_REPORT_TABS];
  const canOpen = (key: string) => allowedTabs.includes(key) && (key !== 'staff' || staffTabAvailable);

  /**
   * A tab they cannot open lands on the first one they can, rather than on a
   * 403 the screen would have to explain. If they can open nothing, the nav
   * never offered the link — but a bookmark could still arrive here, so it is
   * answered plainly.
   */
  const firstAllowed = ALL_REPORT_TABS.find(canOpen);
  if (!firstAllowed) {
    return (
      <div className="page-body">
        <div className="banner">{t('notAvailable')}</div>
      </div>
    );
  }
  const resolvedTab = canOpen(tab) ? tab : firstAllowed;

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
  /*
   * Jira GRW-238 — one branch, or all of them. Owner only, like every other
   * branch choice (product decision 2026-09-14), and only with more than one
   * branch. A stale or foreign id falls back to all branches rather than
   * erroring the page. Resolved before the drawer so it offers that
   * branch's services and people only (Jira GRW-393).
   */
  const branches = (me.member?.role ?? 'owner') === 'owner' && (me.branches?.length ?? 0) > 1 ? me.branches! : [];
  const branch = branches.find((b) => b.id === params.branch)?.id ?? null;

  let filterOptions: ReportFilterOptions = { providers: [], services: [] };
  try {
    filterOptions = await api.reportFilterOptions(branch);
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
  let loadError: LoadErrorKind = 'down';
  try {
    payload =
      resolvedTab === 'overview' ? { tab: 'overview', data: await api.reportsOverview(range, compare, from, to, branch) }
      : resolvedTab === 'revenue' ? { tab: 'revenue', data: await api.reportsRevenue(range, compare, from, to, applied, branch) }
      : resolvedTab === 'bookings' ? { tab: 'bookings', data: await api.reportsBookings(range, compare, from, to, applied, branch) }
      : resolvedTab === 'services' ? { tab: 'services', data: await api.reportsServices(range, compare, from, to, applied, branch) }
      : resolvedTab === 'staff' ? { tab: 'staff', data: await api.reportsStaff(range, compare, from, to, applied, branch) }
      : { tab: 'customers', data: await api.reportsCustomers(range, compare, from, to, branch) };
  } catch (error) {
    payload = null;
    loadError = loadErrorKind(error);
  }

  return (
    <Suspense>
      <ReportsClient
        tab={resolvedTab}
        range={range}
        compare={compare}
        staffTabAvailable={staffTabAvailable}
        allowedTabs={allowedTabs}
        filters={filters}
        filterOptions={filterOptions}
        droppedFilters={droppedFilters}
        providerLabel={me.labels.providers ?? copy.nav.staff}
        tenantName={me.tenant?.name ?? 'growza'}
        rangeLabel={rangeLabelOf(payload) ?? range}
        labels={me.labels}
        payload={payload}
        loadError={loadError}
      />
    </Suspense>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Reports');
