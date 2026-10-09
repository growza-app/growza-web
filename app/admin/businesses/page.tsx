'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Icon, TypeIcon } from '../icons';
import { Card, EmptyState, PrimaryButton, SecondaryButton, Select, StatusPill, Table, TableRow } from '../components/primitives';
import { BUSINESS_COLUMNS } from '../lib/list-columns';
import { AddBusinessModal, OwnerCredentialNotice, type CreatedBusiness } from '../components/AddBusinessModal';
import { Pagination, type PaginationState } from '../components/Pagination';
import { VerticalFilterSheet } from '../components/VerticalFilterSheet';
import { INITIAL_PAGING, applyPageParams, mergeRows } from '../lib/paging';
import { useAdminSearch } from '../components/SearchContext';
import { oklch, STATUS_COLORS, typeColor } from '../tokens';
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
  vertical: string;
  planName: string;
  ownerPhone: string | null;
  branchCount: number;
  userCount: number;
  createdAt: string;
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
  const { query: search } = useAdminSearch();
  const [vertical, setVertical] = useState('All');
  // GRW-104's dashboard drill-through (`?status=suspended`) lands here
  // already filtered — read once on mount rather than staying synced to the
  // URL, since nothing on this page itself needs to write it back.
  const [status, setStatus] = useState(() => {
    const fromUrl = searchParams.get('status');
    return fromUrl && STATUS_OPTIONS.includes(fromUrl) ? fromUrl : 'All';
  });
  const [createdFrom] = useState(() => searchParams.get('createdFrom'));
  const [createdFromCleared, setCreatedFromCleared] = useState(false);
  const activeCreatedFrom = createdFromCleared ? null : createdFrom;
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
  }, [vertical, status, trimmedSearch, activeCreatedFrom]);

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
     
  }, [trimmedSearch, vertical, status, paging, searchTooShort, activeCreatedFrom]);

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

  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<CreatedBusiness | null>(null);

  // The vertical filter's admin-mobile picker — see VerticalFilterSheet's own comment.
  const [mobileVerticalOpen, setMobileVerticalOpen] = useState(false);
  const verticalOptions = [ALL, ...verticalNames];

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
              options={verticalOptions}
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
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vertical}</span>
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
        <div className="admin-filter-grow admin-desktop-only" style={{ width: 150 }}>
          <Select aria-label="Filter by status" options={STATUS_OPTIONS.map(statusLabel)} value={statusLabel(status)} onChange={(e) => setStatus(STATUS_OPTIONS[STATUS_OPTIONS.map(statusLabel).indexOf(e.target.value)]!)} />
        </div>
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

      {/* Jira GRW-297 — admin mobile's status filter: a clickable chip per
          status, each carrying the count of businesses that fall into it
          (matching the current vertical/search filters, not the whole
          platform — see BusinessPage.statusCounts's own comment). Desktop
          keeps the plain dropdown above. */}
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
          onClose={() => setAdding(false)}
          onCreated={(business) => {
            setAdding(false);
            setCreated(business);
            // Straight back to the server rather than splicing the new row in
            // locally: the list carries figures this screen does not compute
            // (branches, users, plan), and a hand-made row would be the one
            // row on the page that is a guess.
            setPaging((p) => ({ ...p }));
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
        ) : (
          <EmptyState title="No businesses on the platform yet" sub="Enroll one to see it here." />
        )
      ) : (
        <>
          <Table
            columns={COLUMNS}
            rows={rows.map((b) => {
              const tc = typeColor(b.vertical);
              return (
                <TableRow key={b.tenantId} columns={COLUMNS} onClick={() => router.push(`/admin/businesses/${b.tenantId}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 11,
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
                      <div style={{ fontSize: 12, color: oklch.textFaint }}>{b.vertical}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13.5, color: 'oklch(0.36 0.02 155)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.ownerPhone ?? <span style={{ color: oklch.textFaint }}>—</span>}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>{b.branchCount}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>{b.userCount}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'oklch(0.36 0.02 155)' }}>{b.planName}</div>
                  <div>
                    <StatusPill status={statusLabel(b.status)} />
                  </div>
                  <div>
                    <NotYetAvailable reason="Bookings aren't counted yet — lands with the usage metering epic (GRW-85)." />
                  </div>
                  <div>
                    <NotYetAvailable reason="Usage against a plan limit isn't tracked yet — lands with the usage metering epic (GRW-85)." />
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
          <Pagination total={page.total} loaded={rows.length} state={paging} onChange={setPaging} />
        </>
      )}
    </div>
  );
}
