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
import { PageHeader } from '../components/PageHeader';
import { RetailReportsNav } from '../components/RetailReportsNav';
import { areasOf } from '../lib/areas';
import { loadErrorKind, type LoadErrorKind } from '../lib/load-error';
import { ReportsClient, type TabPayload } from './ReportsClient';
import { CounterReport } from './CounterReport';
import { DiaryReport } from './DiaryReport';

/**
 * The Reports screen's tabs, in its own order. Mirrors `REPORT_TABS` on the
 * server (`api/security/report-access.ts`) — the setting, the API and this
 * screen have to name the same six things or an owner ticks a box that grants
 * nothing.
 */
const ALL_REPORT_TABS = ['todo', 'overview', 'customers', 'revenue', 'bookings', 'services', 'staff'] as const;

/**
 * The three generic tabs a business with no bookings can still honestly answer.
 *
 * They are no longer where it LANDS. Jira GRW-591 gave a counter business its own four-card report, because
 * the owner's verdict on these three (2026-10-27) was "most of the information is useless and ui is not good
 * and it's for all verticals, Not providing value to owner" — and the screen bore him out: a bar chart of one
 * bar labelled "Products, 100%", the same figure again under "New faces or regulars", client bands reading
 * 29 · 0 · 0 · 0, and "Average visit ₹0" on a kitchen. Those are not bugs; they are what a vertical-neutral
 * report has left once everything a kitchen cannot answer is hidden.
 *
 * The three stay REACHABLE — `?tab=revenue` from a bookmark or a link still renders — because the figures in
 * them are correct and somebody may want them. Nothing on the screen points at them any more. Whether to
 * delete them outright is the owner's call, not a thing to decide inside a layout change.
 *
 * Bookings, Services and Staff were never here: a kitchen has no diary, no service lines and no stylist.
 */
const SHOP_REPORT_TABS = new Set<string>(['overview', 'revenue', 'customers']);

/** What this business's plan allows, before the vertical has its say. */
const allowedTabsOf = (me: { reportTabs?: string[] }): string[] => me.reportTabs ?? [...ALL_REPORT_TABS];

export const dynamic = 'force-dynamic';

const TABS = new Set<string>([
  'todo', 'overview', 'customers', 'revenue', 'bookings', 'services', 'staff',
]);

const RANGES = new Set<string>([
  'today', 'last_7_days', 'this_month', 'last_month', 'last_3_months', 'this_year', 'custom',
]);

/** `custom` needs both ends; without them it is not a range, it is a typo. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What the range actually resolved to, for the download's filename. */
function rangeLabelOf(payload: TabPayload): string | undefined {
  return payload && 'range' in payload.data ? payload.data.range.label : undefined;
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
  const tab = (params.tab && TABS.has(params.tab) ? params.tab : 'todo') as ReportTabKey;
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

  /*
   * Jira GRW-610 — every report here is built from bookings: visits, money from visits, services, the clients a diary
   * brought. A business that takes none has nothing for them to say, and "Money earned ₹0" under a till full of product
   * sales would be a lie. They are absent for it, not zeroed; its own reports (sales, stock, what is selling) are Jira
   * GRW-591's. Until then it is told so plainly, with the two screens that already say what happened.
   */
  const noBookings = !areasOf(me).bookings;
  /** The books are the owner's and the manager's, on either report. A limited role keeps its granted tabs. */
  const role = me.member?.role;
  const maySeeTheBooks = role === undefined || role === 'owner' || role === 'manager';
  /*
   * A shop asking for one of its three analytics tabs falls through to the ordinary renderer below; anything
   * else about a business with no bookings is still answered by the hub. `tab` has already been checked
   * against `TABS`, and `canOpen` below still has the final say — this decides which PAGE answers, not who
   * may see it.
   */
  /*
   * Jira GRW-591 — a counter business opens on its OWN report, and only a deep link reaches the generic
   * three. `params.tab` is what distinguishes the two: absent means "show me Reports", which is now the
   * four cards; present and one of the three means somebody asked for that one by name.
   */
  const shopTab = tab;
  const askedGenericTab = noBookings && params.tab !== undefined;
  if (noBookings && !(askedGenericTab && SHOP_REPORT_TABS.has(shopTab) && allowedTabsOf(me).includes(shopTab))) {
    const mayOpenShopReports = areasOf(me).shop && maySeeTheBooks;
    // "See your stock" is a count's link: a kitchen keeps none, and its menu is already in the nav.
    const counted = areasOf(me).stock;
    return (
      <>
        <PageHeader
          title={t('title')}
          actions={
            areasOf(me).shop ? (
              <>
                <a className="btn btn-ghost" href="/orders">{t('shopSoonOrders')}</a>
                {mayOpenShopReports && counted ? <a className="btn btn-ghost" href="/stock">{t('shopSoonStock')}</a> : null}
              </>
            ) : undefined
          }
        />
        <div className="page-body srp-page">
          {mayOpenShopReports ? (
            <>
              {/* The way to the other six sits where an owner's eye goes for it, above the report
                  rather than below a screenful of cards. */}
              <h2 className="cr-more">{t('counterMore')}</h2>
              <RetailReportsNav active="hub" />
              <CounterReport />
            </>
          ) : (
            <div className="card">
              <div className="empty">
                <p><strong>{t('shopSoonTitle')}</strong></p>
                <p className="muted">{t('shopSoonBody')}</p>
              </div>
            </div>
          )}
        </div>
      </>
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
  const allowedTabs = allowedTabsOf(me).filter((key) => !noBookings || SHOP_REPORT_TABS.has(key));
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
  const resolvedTab = canOpen(shopTab) ? shopTab : firstAllowed;

  /*
   * Jira GRW-591 — a business that books time opens on its OWN four cards, the mirror of what a counter
   * business gets above.
   *
   * The same rule decides it: no `?tab=` means "show me Reports", which is the cards; a tab named by name
   * is somebody asking for that one. The seven tabs stay exactly as they were behind their own links —
   * their figures are correct and the owner who wants Money every morning is one tap from it — but they
   * are no longer what the screen opens with, because seven tabs of figures is what "most of the
   * information is useless" meant.
   *
   * Owner and manager only, like every other money report: a limited role keeps the tabs it was granted
   * and never sees the whole salon's takings on a card it did not ask for.
   */
  if (!noBookings && params.tab === undefined && maySeeTheBooks) {
    return (
      <>
        <PageHeader title={t('title')} />
        <div className="page-body srp-page">
          <h2 className="cr-more">{t('counterMore')}</h2>
          <nav className="srp-nav srp-nav-links" aria-label={t('title')}>
            {ALL_REPORT_TABS.filter(canOpen).map((key) => (
              <a key={key} className="srp-nav-tab" href={`/reports?tab=${key}`}>
                {t(`tabs.${key}`)}
              </a>
            ))}
          </nav>
          <DiaryReport />
        </div>
      </>
    );
  }

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
      resolvedTab === 'todo' ? { tab: 'todo', data: await api.reportsTodo(branch) }
      : resolvedTab === 'overview' ? { tab: 'overview', data: await api.reportsOverview(range, compare, from, to, branch) }
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
