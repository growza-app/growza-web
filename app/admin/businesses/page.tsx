'use client';

import { BusinessesToolbar } from '../components/BusinessesToolbar';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Icon, TypeIcon } from '../icons';
import { businessHealth } from '../lib/business-health';
import { BusinessPhoneList } from '../components/BusinessPhoneList';
import { Card, EmptyState, PrimaryButton, SecondaryButton, Select, StatusPill, Table, TableRow, Toggle, type TableSort } from '../components/primitives';
import { isDefaultSort, MOBILE_SORT_OPTIONS, nextSort, sortFromOption, sortFromParams } from '../lib/business-sort';
import { BUSINESS_COLUMNS } from '../lib/list-columns';
import { AddBusinessModal, OwnerCredentialNotice, type CreatedBusiness } from '../components/AddBusinessModal';
import { Pagination, type PaginationState } from '../components/Pagination';
import { VerticalFilterSheet } from '../components/VerticalFilterSheet';
import { INITIAL_PAGING, applyPageParams, mergeRows, reloadFromFirstPage } from '../lib/paging';
import { useAdminSearch } from '../components/SearchContext';
import { oklch, STATUS_COLORS, typeColor, usageState } from '../tokens';
import { useAdminMe } from '../components/AdminMeContext';

/**
 * GRW-101's Businesses list, wired to GRW-100's real read layer in place of
 * the mock data module.
 *
 * The vertical filters used to be `['All', 'Salon', 'Clinic']` here, with a
 * comment claiming this screen "shows what is real" — while being the one
 * place in the product that could not know. It was true for exactly as long as
 * there were two verticals. They now come from `/business-types`, which reads
 * `business_type_version`, so a vertical shipped as a JSON file appears here
 * with no frontend change (GRW-175).
 */
const ALL = 'All';
const STATUS_OPTIONS = ['All', 'provisioning', 'active', 'suspended', 'churned'];
const statusLabel = (s: string) => (s === 'All' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1));

// Jira GRW-288 — the columns live in lib/list-columns.ts, where a test holds
// their minimums to the widths this table has to fit.
const COLUMNS = BUSINESS_COLUMNS;

interface BusinessRow {
  tenantId: string;
  name: string;
  status: string;
  /** Jira GRW-692 — only ever true when the list was asked to include test businesses. */
  isTest?: boolean;
  vertical: string;
  planName: string;
  ownerPhone: string | null;
  branchCount: number;
  userCount: number;
  createdAt: string;
  /** Jira GRW-701 — absent from an API older than growza#514. */
  lastActiveAt?: string | null;
  weekActivity?: number;
  /**
   * Owner, 2026-10-26 — `true` when a provisioning business has finished its checklist and is waiting on
   * somebody here to press Activate. `null` for every other status: a live business has no checklist, and a
   * `false` on one would read as a fault rather than as "does not apply".
   */
  ready: boolean | null;
}

interface BusinessStatusCount {
  status: string;
  count: number;
}

interface BusinessPage {
  rows: BusinessRow[];
  total: number;
  /** Jira GRW-297 — the admin-mobile status chips' counts; see businesses.ts's own comment for why these ignore the `status` filter itself. */
  statusCounts: BusinessStatusCount[];
}

/** No metering epic has shipped — a real count here would be a claim nothing backs (GRW-101 BR-02: "a zero is a claim"). */
function NotYetAvailable({ reason }: { reason: string }) {
  return (
    <span title={reason} style={{ color: oklch.textFaint, fontWeight: 700, cursor: 'help' }}>
      —
    </span>
  );
}

export default function AdminBusinessesPage() {
  return (
    <Suspense>
      <AdminBusinessesInner />
    </Suspense>
  );
}

function AdminBusinessesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { query: search, setQuery: setSearch } = useAdminSearch();
  const [vertical, setVertical] = useState('All');
  // GRW-104's dashboard drill-through (`?status=suspended`) lands here
  // already filtered — read once on mount, and written back below.
  const [status, setStatus] = useState(() => {
    const fromUrl = searchParams.get('status');
    return fromUrl && STATUS_OPTIONS.includes(fromUrl) ? fromUrl : 'All';
  });
  const [createdFrom] = useState(() => searchParams.get('createdFrom'));
  const [createdFromCleared, setCreatedFromCleared] = useState(false);
  // Jira GRW-693 — the order, read from and written back to the URL like every other filter.
  const [sort, setSort] = useState<TableSort>(() => sortFromParams(searchParams));
  // Jira GRW-692 — test businesses are hidden unless the admin asks; kept in the URL like every other filter.
  const [showTest, setShowTest] = useState(() => searchParams.get('test') === '1');
  const activeCreatedFrom = createdFromCleared ? null : createdFrom;

  /*
   * Admin audit 2026-10-09, L10 — the URL follows the filters it was read from. It was read once and never written,
   * so an admin who opened "Suspended" from the dashboard, set the list back to All and reloaded was shown Suspended
   * again — a filter they had cleared, with nothing on screen saying why the list was short.
   */
  useEffect(() => {
    const params = new URLSearchParams();
    if (status !== 'All') params.set('status', status);
    if (activeCreatedFrom) params.set('createdFrom', activeCreatedFrom);
    if (!isDefaultSort(sort)) {
      params.set('sort', sort.key);
      params.set('dir', sort.dir);
    }
    if (showTest) params.set('test', '1');
    const next = params.size > 0 ? `/admin/businesses?${params}` : '/admin/businesses';
    if (`${window.location.pathname}${window.location.search}` !== next) router.replace(next, { scroll: false });
  }, [status, activeCreatedFrom, sort, showTest, router]);
  const [paging, setPaging] = useState<PaginationState>(INITIAL_PAGING);
  const [page, setPage] = useState<BusinessPage | null>(null);
  /**
   * Jira GRW-140 — what is on screen, which is no longer the same thing as
   * the last response. A numbered page replaces this; "Load more" adds to it.
   */
  const [rows, setRows] = useState<BusinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trimmedSearch = search.trim();
  // FR: a search under 2 characters issues no request rather than matching everything.
  const searchTooShort = trimmedSearch.length > 0 && trimmedSearch.length < 2;

  useEffect(() => {
    // Bail out with the SAME object reference when already on page 1 —
    // `{ ...p, page: 1 }` unconditionally would still be a *new* reference
    // even when nothing actually changed, which was enough for React to
    // treat `paging` as changed and re-fire the fetch effect below a
    // second time for every filter change (confirmed via network trace:
    // two identical requests per filter click). Returning `p` itself here
    // makes React skip the re-render entirely in that case.
    setPaging((p) => (p.page === 1 ? p : { ...p, page: 1, intent: 'replace' }));
  }, [vertical, status, trimmedSearch, activeCreatedFrom, sort, showTest]);

  useEffect(() => {
    if (searchTooShort) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (trimmedSearch) params.set('search', trimmedSearch);
    if (vertical !== ALL) params.set('vertical', vertical);
    if (status !== 'All') params.set('status', status);
    if (activeCreatedFrom) params.set('createdFrom', activeCreatedFrom);
    params.set('sort', sort.key);
    params.set('dir', sort.dir);
    if (showTest) params.set('includeTest', 'true');
    applyPageParams(params, paging);

    adminFetch<BusinessPage>(`/businesses?${params}`, { signal: controller.signal })
      .then((result) => {
        setPage(result);
        setRows((prev) => mergeRows(prev, result.rows, paging.intent));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof AdminApiError ? err.message : 'Could not load businesses.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
     
  }, [trimmedSearch, vertical, status, paging, searchTooShort, activeCreatedFrom, sort, showTest]);

  const hasActiveFilters = vertical !== ALL || status !== 'All' || trimmedSearch.length >= 2 || !!activeCreatedFrom;
  const totalStatusCount = (page?.statusCounts ?? []).reduce((sum, s) => sum + s.count, 0);

  /**
   * The verticals that exist, and whether this admin may add a business.
   *
   * AC-02: the control is not rendered for an admin who cannot use it, and the route refuses them regardless.
   *
   * Batch D — permissions come from the shared `/me` (`useAdminMe`) instead of a second read here, and Add business
   * needs `admin.plan.view` as well: the form's plan picker loads `/plans`, so a role that could create but not see
   * plans was offered a form that only ever showed a load error.
   */
  const [verticalNames, setVerticalNames] = useState<string[]>([]);
  const { can } = useAdminMe();
  const canCreate = can('admin.business.create') && can('admin.plan.view');
  const canViewUsage = can('admin.usage.view');
  const [usageByBusiness, setUsageByBusiness] = useState<Record<string, { used: number; limit: number | null; resolved: boolean }>>({});
  useEffect(() => {
    const controller = new AbortController();
    adminFetch<{ code: string; name: string }[]>('/business-types', { signal: controller.signal })
      .then((types) => {
        if (!controller.signal.aborted) setVerticalNames(types.map((t) => t.name));
      })
      .catch(() => {
        // A filter list that failed to load is a narrower page, not a broken
        // one — the list itself still works, unfiltered.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!canViewUsage) return;
    const controller = new AbortController();
    adminFetch<{
      rows: Array<{
        businessId: string;
        limitsResolved: boolean;
        meters: Array<{ usageType: string; used: number; limit: number | null }>;
      }>;
    }>('/usage?pageSize=100', { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        const next: Record<string, { used: number; limit: number | null; resolved: boolean }> = {};
        for (const r of res.rows) {
          const booking = r.meters.find((m) => m.usageType === 'booking');
          next[r.businessId] = {
            used: booking?.used ?? 0,
            limit: booking?.limit ?? null,
            resolved: r.limitsResolved,
          };
        }
        setUsageByBusiness(next);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [canViewUsage]);

  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<CreatedBusiness | null>(null);

  // The vertical filter's admin-mobile picker — see VerticalFilterSheet's own comment.
  const [mobileVerticalOpen, setMobileVerticalOpen] = useState(false);
  const verticalOptions = [ALL, ...verticalNames];
  const verticalSelectOptions = [{ value: ALL, label: 'All verticals' }, ...verticalNames.map((v) => ({ value: v, label: v }))];

  return (
    <div>
      <div className="admin-filter-bar" style={{ display: 'flex', gap: 9, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Jira GRW-267 · GRW-272 first made this a chip row — wrapping to three
            lines on a laptop, sideways-scrolling on a phone once verticals grew
            past a couple. A dropdown has neither problem at any width, and
            already matches the Status filter beside it. */}
        <div className="admin-filter-grow" style={{ width: 170 }}>
          <div className="admin-desktop-only">
            <Select
              aria-label="Filter by vertical"
              options={verticalSelectOptions}
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
            />
          </div>
          <div className="admin-mobile-only" style={{ width: '100%' }}>
            <button
              type="button"
              onClick={() => setMobileVerticalOpen(true)}
              style={{
                width: '100%',
                height: 44,
                padding: '0 14px',
                borderRadius: 11,
                border: `1px solid ${oklch.borderStrong}`,
                background: oklch.inputBg,
                fontSize: 14,
                fontWeight: 600,
                color: oklch.textStrong,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {vertical === ALL ? 'All verticals' : vertical}
              </span>
              <span style={{ display: 'inline-flex', transform: 'rotate(90deg)', flex: 'none', color: oklch.textFaint }}>
                <Icon name="chevronRight" size={14} />
              </span>
            </button>
          </div>
        </div>
        {/* Desktop only — on admin mobile, status is the chip row below the bar
            instead (GRW-297): a fixed four-status set reads better as chips
            with their own counts than as a dropdown, and doesn't need a
            drawer's search the way the open-ended vertical list does. Its own
            `admin-desktop-only` (not a wrapped inner div, unlike the vertical
            filter above) so the whole slot is removed from the mobile flex
            row rather than left behind as an empty gap. */}
        <div className="admin-filter-grow admin-desktop-only" style={{ width: 155 }}>
          <Select
            aria-label="Filter by status"
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s === ALL ? 'All statuses' : statusLabel(s) }))}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          />
        </div>
        <label className="admin-show-test" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: '0.84375rem', fontWeight: 600, color: oklch.textMuted, cursor: 'pointer' }}>
          <Toggle on={showTest} onClick={() => setShowTest((v) => !v)} label="Show test businesses" />
          Show test businesses
        </label>
        {canCreate ? (
          // `admin-businesses-add-first`: admin mobile only — "Add business"
          // renders first in the flex row so it appears above the two filter
          // dropdowns instead of below them, without reordering `admin-bar-end`
          // globally (the business detail page uses that same class for an
          // unrelated action bar).
          <div className="admin-bar-end admin-businesses-add-first">
            <PrimaryButton onClick={() => setAdding(true)}>Add business</PrimaryButton>
          </div>
        ) : null}
      </div>

      {/* Jira GRW-702 — saved views and Export CSV, over the list they apply to. */}
      <BusinessesToolbar
        current={{ vertical, status, search }}
        canSave={hasActiveFilters}
        total={page?.total ?? null}
        onApply={(f) => {
          setVertical(f.vertical);
          setStatus(f.status);
          setSearch(f.search);
        }}
      />

      {/* Jira GRW-297 — admin mobile's status filter: a clickable chip per
          status, each carrying the count of businesses that fall into it
          (matching the current vertical/search filters, not the whole
          platform — see BusinessPage.statusCounts's own comment). Desktop
          keeps the plain dropdown above. */}
      <div className="admin-mobile-only" style={{ marginBottom: 12 }}>
        <Select
          aria-label="Sort businesses"
          options={MOBILE_SORT_OPTIONS}
          value={MOBILE_SORT_OPTIONS.some((o) => o.value === `${sort.key}:${sort.dir}`) ? `${sort.key}:${sort.dir}` : 'created:desc'}
          onChange={(e) => setSort(sortFromOption(e.target.value))}
        />
      </div>
      <div className="admin-mobile-only admin-status-chip-row" style={{ gap: 8, marginBottom: 16 }}>
        {STATUS_OPTIONS.map((s) => {
          const label = statusLabel(s);
          const count = s === ALL ? totalStatusCount : (page?.statusCounts.find((sc) => sc.status === s)?.count ?? 0);
          const selected = status === s;
          const [fg] = STATUS_COLORS[label] ?? ['oklch(0.5 0.02 155)', 'oklch(0.95 0.006 150)'];
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 34,
                padding: '0 12px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                border: 'none',
                ...(selected
                  ? { background: 'oklch(0.31 0.055 158)', color: 'white' }
                  : { background: 'white', color: 'oklch(0.45 0.02 155)', border: `1px solid ${oklch.borderStrong}` }),
              }}
            >
              {s !== ALL ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: selected ? 'white' : fg, flex: 'none' }} /> : null}
              {label}
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: selected ? 'oklch(1 0 0 / 0.2)' : oklch.divider,
                  color: selected ? 'white' : oklch.textMuted,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <VerticalFilterSheet
        open={mobileVerticalOpen}
        options={verticalOptions}
        value={vertical}
        onSelect={(v) => {
          setVertical(v);
          setMobileVerticalOpen(false);
        }}
        onClose={() => setMobileVerticalOpen(false)}
      />

      {adding ? (
        <AddBusinessModal
          // The same permission the discount dialog's route asks, and the enrol route now asks too — so the
          // section is not offered to an admin whose request would be refused with a 403.
          canDiscount={can('admin.discount.manage')}
          onClose={() => setAdding(false)}
          onCreated={(business) => {
            setAdding(false);
            setCreated(business);
            // Straight back to the server rather than splicing the new row in
            // locally: the list carries figures this screen does not compute
            // (branches, users, plan), and a hand-made row would be the one
            // row on the page that is a guess.
            setPaging(reloadFromFirstPage);
          }}
        />
      ) : null}

      {created ? <OwnerCredentialNotice created={created} onClose={() => setCreated(null)} /> : null}

      {activeCreatedFrom ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, color: oklch.textMuted }}>
          Created since {new Date(activeCreatedFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          <button
            type="button"
            onClick={() => setCreatedFromCleared(true)}
            style={{ background: 'none', border: 'none', color: oklch.accentText, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0 }}
          >
            Clear
          </button>
        </div>
      ) : null}

      {searchTooShort ? (
        <div style={{ fontSize: 13, color: oklch.textFaint, marginBottom: 14 }}>Type at least 2 characters to search.</div>
      ) : error ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '24px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
            <SecondaryButton onClick={() => setPaging((p) => ({ ...p }))}>Retry</SecondaryButton>
          </div>
        </Card>
      ) : loading && !page ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ height: 56, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
            ))}
          </div>
        </Card>
      ) : !page || page.total === 0 ? (
        hasActiveFilters ? (
          <EmptyState title="No businesses match" sub="Try a different filter or search term." />
        ) : !showTest ? (
          // Jira GRW-692 AC-03 — the list may be empty only because every business is a test one; say so.
          <EmptyState
            title="No businesses to show"
            sub="Test businesses are hidden."
            action={<SecondaryButton onClick={() => setShowTest(true)}>Show test businesses</SecondaryButton>}
          />
        ) : (
          <EmptyState title="No businesses on the platform yet" sub="Enroll one to see it here." />
        )
      ) : (
        <>
          {/* Jira GRW-694 — a phone gets the short inset list; the table keeps every width above the phone breakpoint. */}
          <BusinessPhoneList rows={rows} statusLabel={statusLabel} />
          <div className="admin-businesses-table">
          <Table
            columns={COLUMNS}
            dense
            sort={sort}
            onSort={(key) => setSort((s) => nextSort(s, key))}
            rows={rows.map((b) => {
              const tc = typeColor(b.vertical);
              return (
                <TableRow key={b.tenantId} columns={COLUMNS} onClick={() => router.push(`/admin/businesses/${b.tenantId}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: tc.bg,
                        color: tc.fg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                      }}
                    >
                      <TypeIcon type={b.vertical} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {b.name}
                      </div>
                      <div style={{ fontSize: 12, color: oklch.textFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.vertical}</div>
                      <RowHealth business={b} />
                    </div>
                  </div>
                  <div style={{ fontSize: 13.5, color: 'oklch(0.36 0.02 155)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.ownerPhone ?? <span style={{ color: oklch.textFaint }}>—</span>}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>{b.branchCount}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>{b.userCount}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'oklch(0.36 0.02 155)' }}>{b.planName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <StatusPill status={statusLabel(b.status)} />
                    {b.isTest ? <TestPill /> : null}
                    {/*
                      * Nothing used to tell anybody here that an owner had finished setting up — readiness was
                      * computed on the one-business page only, so it meant opening each Provisioning row in turn.
                      * A business that finished on Friday could stay switched off until somebody looked.
                      */}
                    {b.ready ? (
                      <span
                        title="This business has finished its setup checklist and can be activated."
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 999,
                          whiteSpace: 'nowrap',
                          color: 'oklch(0.42 0.13 150)',
                          background: 'oklch(0.95 0.04 150)',
                          border: '1px solid oklch(0.86 0.07 150)',
                        }}
                      >
                        Ready
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>
                    {usageByBusiness[b.tenantId] !== undefined ? (
                      usageByBusiness[b.tenantId]!.used.toLocaleString('en-IN')
                    ) : (
                      <NotYetAvailable reason="No active billing period metered for this business." />
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                    {(() => {
                      const u = usageByBusiness[b.tenantId];
                      if (!u) return <NotYetAvailable reason="No active billing period metered for this business." />;
                      if (!u.resolved) return <span style={{ color: 'oklch(0.52 0.13 65)' }}>Unknown</span>;
                      if (u.limit === null) return <span style={{ color: oklch.textFaint, fontWeight: 600 }}>No limit</span>;
                      if (u.limit === 0) return <span style={{ color: oklch.danger }}>Blocked</span>;
                      const { pct, color } = usageState(u.used, u.limit);
                      return (
                        <span title={`${u.used.toLocaleString('en-IN')} of ${u.limit.toLocaleString('en-IN')} bookings used`} style={{ color }}>
                          {pct}%
                        </span>
                      );
                    })()}
                  </div>
                  <div style={{ fontSize: 12.5, color: oklch.textFaint, fontWeight: 600 }}>
                    {new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/businesses/${b.tenantId}`);
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        border: `1px solid ${oklch.border}`,
                        background: 'white',
                        color: 'oklch(0.5 0.02 155)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name="chevronRight" size={15} />
                    </button>
                  </div>
                </TableRow>
              );
            })}
          />
          </div>
          <Pagination total={page.total} loaded={rows.length} state={paging} onChange={setPaging} />
        </>
      )}
      {canCreate ? (
        <>
          <div className="admin-fab-clearance" aria-hidden />
          <button type="button" className="admin-fab" onClick={() => setAdding(true)}>
            <Icon name="plus" size={20} />
            Add business
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Jira GRW-701 — under the name: active and this week's count, or quiet in the warning colour. */
function RowHealth({ business }: { business: BusinessRow }) {
  const health = businessHealth(business);
  if (!health) return null;
  return (
    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: health.quiet ? 'oklch(0.52 0.13 65)' : oklch.textFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {health.text}
    </div>
  );
}

/** Jira GRW-692 — marks a test business when the list is showing them. Grey: it is a fact, not a warning. */
function TestPill() {
  return (
    <span
      title="A test business: left out of the dashboard's figures."
      style={{
        fontSize: '0.75rem',
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        color: oklch.textMuted,
        background: 'oklch(0.96 0.004 250)',
        border: `1px solid ${oklch.border}`,
      }}
    >
      Test
    </span>
  );
}
