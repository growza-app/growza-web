'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateOnly, formatMoneyMinor } from '../lib/format';
import { SUBSCRIPTION_STATUS_VALUES, subscriptionStatusLabel } from '../lib/subscription-status';
import { Card, EmptyState, SecondaryButton, Select, StatusPill, Table, TableRow, type TableColumn } from '../components/primitives';
import { DEFAULT_PAGE_SIZE, Pagination, type PaginationState } from '../components/Pagination';
import { useAdminSearch } from '../components/SearchContext';
import { Icon, TypeIcon } from '../icons';
import { oklch, typeColor } from '../tokens';

/**
 * GRW-111's Subscriptions list, wired to real `subscription` rows (GRW-109)
 * through GRW-100's cross-tenant read layer. It used to render eight invented
 * businesses behind a "sample data — not real accounts" banner; the layout is
 * the same ported design, the figures are now the ones the platform will
 * actually bill.
 *
 * List, discount and final price stay three separate columns
 * (13-platform-administration.md §2.1). A final price shown on its own would
 * hide that it is an exception — which is the entire reason a discount lives
 * on the subscription instead of becoming a plan.
 */
const STATUS_OPTIONS = ['All', ...SUBSCRIPTION_STATUS_VALUES];

const COLUMNS: TableColumn[] = [
  { label: 'Business', width: '1.7fr' },
  { label: 'Plan', width: '1.1fr' },
  { label: 'List', width: '0.9fr' },
  { label: 'Discount', width: '0.9fr' },
  { label: 'Final', width: '0.9fr' },
  { label: 'Status', width: '1.1fr' },
  { label: 'Next billing', width: '1fr' },
  { label: '', width: '50px', right: true },
];

interface SubscriptionRow {
  id: string;
  businessId: string;
  businessName: string;
  vertical: string;
  planCode: string;
  planName: string;
  planVersion: number;
  status: string;
  listPriceMinor: number;
  discountAmountMinor: number;
  finalPriceMinor: number;
  currency: string;
  startDate: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  cancelAtPeriodEnd: boolean;
}

interface SubscriptionPage {
  rows: SubscriptionRow[];
  total: number;
}

export default function AdminSubscriptionsPage() {
  const router = useRouter();
  const { query: search } = useAdminSearch();
  const [status, setStatus] = useState('All');
  const [discountedOnly, setDiscountedOnly] = useState(false);
  const [paging, setPaging] = useState<PaginationState>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const [page, setPage] = useState<SubscriptionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trimmedSearch = search.trim();
  // Same rule as the Businesses list — a one-character search matches
  // everything, so it issues no request at all rather than a useless one.
  const searchTooShort = trimmedSearch.length > 0 && trimmedSearch.length < 2;

  useEffect(() => {
    // Returning `p` itself when already on page 1 keeps the object identity
    // stable, so React does not treat `paging` as changed and fire the fetch
    // below twice for one filter click (the double-request bug traced on
    // Businesses).
    setPaging((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [status, discountedOnly, trimmedSearch]);

  useEffect(() => {
    if (searchTooShort) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (trimmedSearch) params.set('search', trimmedSearch);
    if (status !== 'All') params.set('status', status);
    if (discountedOnly) params.set('discounted', 'true');
    // Accumulating-prefix pagination, as everywhere else in this portal: the
    // API returns page 1 through the current window so mobile's "Load more"
    // appends instead of replacing.
    params.set('page', '1');
    params.set('pageSize', String(paging.page * paging.pageSize));

    adminFetch<SubscriptionPage>(`/subscriptions?${params}`, { signal: controller.signal })
      .then((result) => setPage(result))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof AdminApiError ? err.message : 'Could not load subscriptions.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedSearch, status, discountedOnly, paging, searchTooShort]);

  const hasActiveFilters = status !== 'All' || discountedOnly || trimmedSearch.length >= 2;

  return (
    <div>
      <div style={{ display: 'flex', gap: 9, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ width: 180 }}>
          <Select
            options={STATUS_OPTIONS.map(subscriptionStatusLabel)}
            value={subscriptionStatusLabel(status)}
            onChange={(e) =>
              setStatus(STATUS_OPTIONS[STATUS_OPTIONS.map(subscriptionStatusLabel).indexOf(e.target.value)] ?? 'All')
            }
          />
        </div>
        <button
          type="button"
          onClick={() => setDiscountedOnly((v) => !v)}
          aria-pressed={discountedOnly}
          style={{
            height: 38,
            padding: '0 16px',
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 700,
            cursor: 'pointer',
            ...(discountedOnly
              ? { background: 'oklch(0.31 0.055 158)', color: 'white', border: '1px solid oklch(0.31 0.055 158)' }
              : { background: 'white', color: 'oklch(0.45 0.02 155)', border: `1px solid ${oklch.borderStrong}` }),
          }}
        >
          Discounted only
        </button>
      </div>

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
          <EmptyState icon="subs" title="No subscriptions match" sub="Try a different status or search term." />
        ) : (
          <EmptyState icon="subs" title="No subscriptions yet" sub="A business gets one when it is put on a plan." />
        )
      ) : (
        <>
          <Table
            columns={COLUMNS}
            minWidthPx={980}
            rows={page.rows.map((s) => {
              const tc = typeColor(s.vertical);
              const discounted = s.discountAmountMinor > 0;
              return (
                <TableRow key={s.id} columns={COLUMNS} onClick={() => router.push(`/admin/subscriptions/${s.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, background: tc.bg, color: tc.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                      <TypeIcon type={s.vertical} size={16} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.businessName}
                      </div>
                      <div style={{ fontSize: 11.5, color: oklch.textFaint }}>{s.vertical}</div>
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'oklch(0.4 0.02 155)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.planName}
                    </div>
                    {/* The version this business is pinned to. It matters on this
                        screen because a later plan version does not re-rate an
                        existing subscription — two rows on the same plan can
                        legitimately show different list prices. */}
                    <div style={{ fontSize: 11.5, color: oklch.textFaint }}>v{s.planVersion}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'oklch(0.45 0.02 155)' }}>{formatMoneyMinor(s.listPriceMinor)}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: discounted ? 'oklch(0.5 0.15 25)' : oklch.textFaint }}>
                    {discounted ? '−' + formatMoneyMinor(s.discountAmountMinor) : '—'}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: oklch.accentText }}>{formatMoneyMinor(s.finalPriceMinor)}</div>
                  <div>
                    <StatusPill status={subscriptionStatusLabel(s.status)} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.3 0.02 155)' }}>{formatDateOnly(s.nextBillingDate)}</div>
                    {/* A subscription set to stop at the period end still shows a
                        next billing date, and without this it reads as one that
                        will be charged. */}
                    {s.cancelAtPeriodEnd ? (
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'oklch(0.52 0.13 65)' }}>Ends at period end</div>
                    ) : null}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/subscriptions/${s.id}`);
                      }}
                      aria-label={`Open ${s.businessName}'s subscription`}
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
          {/* maxRows=100 mirrors listSubscriptionsForAdmin's own hard server-side
              clamp (src/modules/admin/subscriptions.ts) — QA pass 7. */}
          <Pagination total={page.total} shown={page.rows.length} state={paging} onChange={setPaging} maxRows={100} />
        </>
      )}
    </div>
  );
}
