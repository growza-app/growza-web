'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { isTerminalSubscriptionStatus } from '../lib/subscription-status';
import { ReenrolModal, reenrolActionLabel } from '../components/ReenrolModal';
import { formatDateOnly, formatMoneyMinor } from '../lib/format';
import { SUBSCRIPTION_STATUS_VALUES, SUBSCRIPTION_VIEWS, subscriptionStatusLabel } from '../lib/subscription-status';
import { Card, EmptyState, SecondaryButton, Select, StatusPill, Table, TableRow } from '../components/primitives';
import { SUBSCRIPTION_COLUMNS } from '../lib/list-columns';
import { Pagination, type PaginationState } from '../components/Pagination';
import { INITIAL_PAGING, applyPageParams, mergeRows, reloadFromFirstPage } from '../lib/paging';
import { useAdminSearch } from '../components/SearchContext';
import { Icon, TypeIcon } from '../icons';
import { oklch, typeColor } from '../tokens';
import { useAdminMe } from '../components/AdminMeContext';

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

// Jira GRW-288 — the columns live in lib/list-columns.ts, where a test holds
// their minimums to the widths this table has to fit.
const COLUMNS = SUBSCRIPTION_COLUMNS;

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

// `useSearchParams` needs a Suspense boundary, as on Businesses.
export default function AdminSubscriptionsPage() {
  return (
    <Suspense>
      <SubscriptionsList />
    </Suspense>
  );
}

function SubscriptionsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { query: search } = useAdminSearch();
  const [status, setStatus] = useState('All');
  const viewParam = searchParams.get('view');
  const view = viewParam && Object.hasOwn(SUBSCRIPTION_VIEWS, viewParam) ? viewParam : null;
  /** The subscription the re-enrol dialog is open for, or null (GRW-148). */
  const [reenrolFor, setReenrolFor] = useState<string | null>(null);
  const canManage = useAdminMe().can('admin.subscription.manage');
  const [discountedOnly, setDiscountedOnly] = useState(false);
  const [paging, setPaging] = useState<PaginationState>(INITIAL_PAGING);
  /**
   * Jira GRW-140 — what is on screen, which is no longer the same thing as
   * the last response. A numbered page replaces this; "Load more" adds to it.
   */
  const [rows, setRows] = useState<SubscriptionPage['rows']>([]);
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
    setPaging((p) => (p.page === 1 ? p : { ...p, page: 1, intent: 'replace' }));
  }, [status, discountedOnly, trimmedSearch, view]);

  useEffect(() => {
    if (searchTooShort) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (trimmedSearch) params.set('search', trimmedSearch);
    if (status !== 'All') params.set('status', status);
    if (discountedOnly) params.set('discounted', 'true');
    if (view) params.set('view', view);
    applyPageParams(params, paging);

    adminFetch<SubscriptionPage>(`/subscriptions?${params}`, { signal: controller.signal })
      .then((result) => {
        setPage(result);
        setRows((prev) => mergeRows(prev, result.rows, paging.intent));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof AdminApiError ? err.message : 'Could not load subscriptions.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
     
  }, [trimmedSearch, status, discountedOnly, view, paging, searchTooShort]);

  const hasActiveFilters = status !== 'All' || discountedOnly || trimmedSearch.length >= 2 || view !== null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 9, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ width: 180 }}>
          <Select
            aria-label="Filter by status"
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
        {view ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 38,
              padding: '0 8px 0 14px',
              borderRadius: 10,
              background: oklch.surfaceSubtle,
              border: `1px solid ${oklch.borderStrong}`,
              fontSize: 13.5,
              fontWeight: 700,
              color: oklch.textStrong,
            }}
          >
            {SUBSCRIPTION_VIEWS[view]}
            <button
              type="button"
              onClick={() => router.replace('/admin/subscriptions')}
              aria-label={`Show all subscriptions, not only ${SUBSCRIPTION_VIEWS[view]!.toLowerCase()}`}
              style={{ height: 28, padding: '0 10px', borderRadius: 8, border: 'none', background: 'white', color: oklch.accentText, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Show all
            </button>
          </span>
        ) : null}
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
        view && status === 'All' && !discountedOnly && trimmedSearch.length < 2 ? (
          // A dashboard tile can be opened after its count has gone to 0 — that is good news, not a failed search.
          // Only on the view alone (review fix): with a status or search on top, the empty list is theirs.
          <EmptyState icon="subs" title="None right now" sub={`No subscriptions are in “${SUBSCRIPTION_VIEWS[view]}” at the moment.`} />
        ) : hasActiveFilters ? (
          <EmptyState icon="subs" title="No subscriptions match" sub="Try a different status or search term." />
        ) : (
          <EmptyState icon="subs" title="No subscriptions yet" sub="A business gets one when it is put on a plan." />
        )
      ) : (
        <>
          <Table
            columns={COLUMNS}
            rows={rows.map((s) => {
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
                    {/* A cancelled or expired subscription will never bill
                        again, and `next_billing_date` keeps its last value —
                        so this cell showed a confident future date next to a
                        Cancelled pill, which reads as "the cancel did
                        nothing". It is the first thing an admin checks after
                        pressing the button. */}
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: isTerminalSubscriptionStatus(s.status) ? 'oklch(0.6 0.02 155)' : 'oklch(0.3 0.02 155)',
                      }}
                    >
                      {isTerminalSubscriptionStatus(s.status) ? 'Not billing' : formatDateOnly(s.nextBillingDate)}
                    </div>
                    {/* A subscription set to stop at the period end still shows a
                        next billing date, and without this it reads as one that
                        will be charged. */}
                    {s.cancelAtPeriodEnd ? (
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'oklch(0.52 0.13 65)' }}>Ends at period end</div>
                    ) : null}
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', gap: 7, justifyContent: 'flex-end', alignItems: 'center' }}>
                    {/* FR-01 — labelled with the action it will actually
                        perform, and absent entirely on a subscription that is
                        already trading normally (FR-05). */}
                    {/* Batch D — re-enrol, reactivate and resume need `admin.subscription.manage`; the list is open to
                        `admin.subscription.view`, and its dialog's first request answered a viewer with a 403. */}
                    {canManage && reenrolActionLabel(s.status) ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReenrolFor(s.id);
                        }}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 9,
                          border: `1px solid ${oklch.borderStrong}`,
                          background: 'white',
                          color: oklch.textStrong,
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {reenrolActionLabel(s.status)}
                      </button>
                    ) : null}
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
          <Pagination total={page.total} loaded={rows.length} state={paging} onChange={setPaging} />
        </>
      )}

      <ReenrolModal
        subscriptionId={reenrolFor}
        onClose={() => setReenrolFor(null)}
        // The list is the one screen that must not keep showing a Cancelled
        // pill next to a subscription that has just been re-enrolled — that is
        // the "the button did nothing" reading this product has already been
        // bitten by once. From page 1 (audit M13): a reload token refetched the page in whatever mode it was in,
        // so after "Load more" it appended that page a second time.
        onDone={() => setPaging(reloadFromFirstPage)}
      />
    </div>
  );
}
