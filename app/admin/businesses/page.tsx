'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Icon, TypeIcon } from '../icons';
import { Card, EmptyState, SecondaryButton, Select, StatusPill, Table, TableRow, type TableColumn } from '../components/primitives';
import { DEFAULT_PAGE_SIZE, Pagination, type PaginationState } from '../components/Pagination';
import { useAdminSearch } from '../components/SearchContext';
import { oklch, typeColor } from '../tokens';

/**
 * GRW-101's Businesses list, wired to GRW-100's real read layer in place of
 * the mock data module. The two verticals shown are the two the product
 * actually defines (docs/architecture/verticals/*.json) — the mock's
 * Garage/Dental/Spa/Fitness pills were dressing for the design canvas, not
 * real product categories, and this screen shows what is real.
 */
const VERTICAL_FILTERS = ['All', 'Salon', 'Clinic'];
const STATUS_OPTIONS = ['All', 'provisioning', 'active', 'suspended', 'churned'];
const statusLabel = (s: string) => (s === 'All' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1));

const COLUMNS: TableColumn[] = [
  { label: 'Business', width: '1.8fr' },
  { label: 'Owner', width: '1.4fr' },
  { label: 'Branches', width: '0.8fr' },
  { label: 'Users', width: '0.7fr' },
  { label: 'Plan', width: '1fr' },
  { label: 'Status', width: '1fr' },
  { label: 'Bookings', width: '0.9fr' },
  { label: 'Usage', width: '0.9fr' },
  { label: 'Created', width: '1fr' },
  { label: '', width: '50px', right: true },
];

interface BusinessRow {
  tenantId: string;
  name: string;
  status: string;
  vertical: string;
  planName: string;
  ownerEmail: string | null;
  branchCount: number;
  userCount: number;
  createdAt: string;
}

interface BusinessPage {
  rows: BusinessRow[];
  total: number;
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
  const [paging, setPaging] = useState<PaginationState>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const [page, setPage] = useState<BusinessPage | null>(null);
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
    setPaging((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [vertical, status, trimmedSearch, activeCreatedFrom]);

  useEffect(() => {
    if (searchTooShort) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (trimmedSearch) params.set('search', trimmedSearch);
    if (vertical !== 'All') params.set('vertical', vertical);
    if (status !== 'All') params.set('status', status);
    if (activeCreatedFrom) params.set('createdFrom', activeCreatedFrom);
    // Accumulating-prefix pagination, same pattern as AuditLogList — the
    // API returns everything from page 1 up to the current window, so
    // mobile's "Load more" appends instead of replacing.
    params.set('page', '1');
    params.set('pageSize', String(paging.page * paging.pageSize));

    adminFetch<BusinessPage>(`/businesses?${params}`, { signal: controller.signal })
      .then((result) => setPage(result))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof AdminApiError ? err.message : 'Could not load businesses.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
     
  }, [trimmedSearch, vertical, status, paging, searchTooShort, activeCreatedFrom]);

  const hasActiveFilters = vertical !== 'All' || status !== 'All' || trimmedSearch.length >= 2 || !!activeCreatedFrom;

  return (
    <div>
      <div style={{ display: 'flex', gap: 9, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {VERTICAL_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setVertical(f)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: 38,
              padding: '0 15px',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              ...(vertical === f
                ? { background: 'oklch(0.31 0.055 158)', color: 'white' }
                : { background: 'white', color: 'oklch(0.45 0.02 155)', border: `1px solid ${oklch.borderStrong}` }),
            }}
          >
            {f !== 'All' ? <TypeIcon type={f} size={16} /> : null}
            {f}
          </button>
        ))}
        <div style={{ width: 150 }}>
          <Select options={STATUS_OPTIONS.map(statusLabel)} value={statusLabel(status)} onChange={(e) => setStatus(STATUS_OPTIONS[STATUS_OPTIONS.map(statusLabel).indexOf(e.target.value)]!)} />
        </div>
      </div>

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
            minWidthPx={1180}
            rows={page.rows.map((b) => {
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
                    {b.ownerEmail ?? <span style={{ color: oklch.textFaint }}>—</span>}
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
          {/* maxRows=100 mirrors listBusinessesForAdmin's own hard server-side
              clamp (src/modules/admin/businesses.ts) — QA pass 7, same shared
              root cause as the Subscriptions list. */}
          <Pagination total={page.total} shown={page.rows.length} state={paging} onChange={setPaging} maxRows={100} />
        </>
      )}
    </div>
  );
}
