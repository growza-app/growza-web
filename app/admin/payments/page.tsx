'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatMoneyMinor, formatTimestampDate } from '../lib/format';
import { billingStatusLabel, PAYMENT_STATUS_VALUES } from '../lib/billing-status';
import { Card, EmptyState, SecondaryButton, Select, StatusPill, Table, TableRow, type TableColumn } from '../components/primitives';
import { DEFAULT_PAGE_SIZE, Pagination, type PaginationState } from '../components/Pagination';
import { useAdminSearch } from '../components/SearchContext';
import { DateRangeFilter, useDateRange } from '../components/DateRangeFilter';
import { oklch } from '../tokens';

/**
 * GRW-119's Payments screen, wired to the real `payment` rows GRW-117
 * records.
 *
 * It used to render one invented payment per mock business — an 18% tax
 * computed in the browser, a status derived from `i % 5`, and an
 * `pay_{4120 + i}` id — behind a "sample data" banner. Those figures are
 * gone. The tax on a payment is now whatever the provider actually moved.
 *
 * **Read-only by design, and that is the story, not an omission.** There is
 * no refund button, no mark-as-paid and no edit: a payment record comes from
 * the provider's own events (13-platform-administration.md §11), and a
 * mistake is corrected at the provider, not here.
 *
 * GRW-144 added the one exception — an offline payment recorded by hand on
 * the subscription screen, for money that arrived by bank transfer. It is
 * still not written from THIS screen, and there is still nothing here that
 * edits a row. Such a row is marked "Recorded by hand" below, because its
 * external id cannot be reconciled against any provider dashboard, which is
 * the reason an admin opens this screen at all.
 */
const STATUS_OPTIONS = ['All', ...PAYMENT_STATUS_VALUES];

const COLUMNS: TableColumn[] = [
  { label: 'Business', width: '1.4fr' },
  { label: 'Amount', width: '0.9fr' },
  { label: 'Refunded', width: '0.8fr' },
  { label: 'Status', width: '1fr' },
  { label: 'Provider · payment id', width: '1.4fr' },
  { label: 'Date', width: '0.9fr' },
];

interface PaymentRow {
  id: string;
  subscriptionId: string | null;
  businessId: string | null;
  businessName: string | null;
  amountMinor: number;
  taxAmountMinor: number;
  discountAmountMinor: number;
  refundedAmountMinor: number;
  currency: string;
  status: string;
  paymentProvider: string;
  externalPaymentId: string;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

interface PaymentPage {
  rows: PaymentRow[];
  total: number;
}

export default function AdminPaymentsPage() {
  return (
    <Suspense>
      <AdminPaymentsInner />
    </Suspense>
  );
}

function AdminPaymentsInner() {
  const searchParams = useSearchParams();
  const { query: search } = useAdminSearch();
  // The dashboard's failed-payments tile links here already filtered
  // (`?status=FAILED`). Read once on mount, like the Businesses list does
  // with its own drill-through — nothing on this page writes it back.
  const [status, setStatus] = useState(() => {
    const fromUrl = searchParams.get('status');
    return fromUrl && (STATUS_OPTIONS as readonly string[]).includes(fromUrl) ? fromUrl : 'All';
  });
  const [unreconciledOnly, setUnreconciledOnly] = useState(false);
  const range = useDateRange();
  const [paging, setPaging] = useState<PaginationState>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const [page, setPage] = useState<PaymentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trimmedSearch = search.trim();
  const searchTooShort = trimmedSearch.length > 0 && trimmedSearch.length < 2;

  useEffect(() => {
    setPaging((p) => (p.page === 1 ? p : { ...p, page: 1 }));
  }, [status, unreconciledOnly, trimmedSearch, range.from, range.to]);

  useEffect(() => {
    // A backwards range issues no request at all — the filter says so inline
    // instead of asking the server to confirm that nothing is between two
    // dates in the wrong order.
    if (searchTooShort || range.invalid) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (trimmedSearch) params.set('search', trimmedSearch);
    if (status !== 'All') params.set('status', status);
    if (unreconciledOnly) params.set('unreconciled', 'true');
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    params.set('page', '1');
    params.set('pageSize', String(paging.page * paging.pageSize));

    adminFetch<PaymentPage>(`/payments?${params}`, { signal: controller.signal })
      .then(setPage)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof AdminApiError ? err.message : 'Could not load payments.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
     
  }, [trimmedSearch, status, unreconciledOnly, range.from, range.to, range.invalid, paging, searchTooShort]);

  const hasActiveFilters = status !== 'All' || unreconciledOnly || trimmedSearch.length >= 2 || Boolean(range.from || range.to);

  return (
    <div>
      <div style={{ display: 'flex', gap: 9, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ width: 170 }}>
          <Select
            options={STATUS_OPTIONS.map(billingStatusLabel)}
            value={billingStatusLabel(status)}
            onChange={(e) => setStatus(STATUS_OPTIONS[STATUS_OPTIONS.map(billingStatusLabel).indexOf(e.target.value)] ?? 'All')}
          />
        </div>
        <DateRangeFilter range={range} />
        <button
          type="button"
          onClick={() => setUnreconciledOnly((v) => !v)}
          aria-pressed={unreconciledOnly}
          // The row an admin is actually hunting for: a real payment whose
          // subscription this platform could not identify (GRW-117).
          title="Payments the provider reported against a subscription Growza could not identify"
          style={{
            height: 38,
            padding: '0 16px',
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 700,
            cursor: 'pointer',
            ...(unreconciledOnly
              ? { background: 'oklch(0.31 0.055 158)', color: 'white', border: '1px solid oklch(0.31 0.055 158)' }
              : { background: 'white', color: 'oklch(0.45 0.02 155)', border: `1px solid ${oklch.borderStrong}` }),
          }}
        >
          Unreconciled only
        </button>
      </div>

      {range.invalid ? (
        <div style={{ fontSize: 13, color: oklch.danger, fontWeight: 600, marginBottom: 14 }}>
          The end of the range is before its start.
        </div>
      ) : searchTooShort ? (
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
          <EmptyState icon="payments" title="No payments match" sub="Try a different status, date range or search term." />
        ) : (
          <EmptyState icon="payments" title="No payments yet" sub="They appear here as the payment provider reports them." />
        )
      ) : (
        <>
          <Table
            columns={COLUMNS}
            minWidthPx={920}
            rows={page.rows.map((p) => (
              <TableRow key={p.id} columns={COLUMNS}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.businessName ?? 'Unreconciled'}
                  </div>
                  {!p.subscriptionId ? (
                    // Flagged, never hidden — this is precisely the row that
                    // needs a human, so it says so on the row itself.
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'oklch(0.52 0.13 65)' }}>No matching subscription</div>
                  ) : null}
                  {p.failureReason ? <div style={{ fontSize: 11.5, color: oklch.danger, fontWeight: 600 }}>{p.failureReason}</div> : null}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: 'oklch(0.28 0.02 155)' }}>{formatMoneyMinor(p.amountMinor)}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: p.refundedAmountMinor > 0 ? 'oklch(0.5 0.15 25)' : oklch.textFaint }}>
                  {p.refundedAmountMinor > 0 ? '−' + formatMoneyMinor(p.refundedAmountMinor) : '—'}
                </div>
                <div>
                  <StatusPill status={billingStatusLabel(p.status)} />
                </div>
                <ExternalId provider={p.paymentProvider} id={p.externalPaymentId} />
                <div style={{ fontSize: 12.5, color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>
                  {formatTimestampDate(p.paidAt ?? p.createdAt)}
                </div>
              </TableRow>
            ))}
          />
          <Pagination total={page.total} shown={page.rows.length} state={paging} onChange={setPaging} maxRows={100} />
        </>
      )}
    </div>
  );
}

/**
 * BR-05 — the external payment id is shown and copyable, because reconciling
 * against the provider's dashboard is the reason an admin opens this screen
 * at all. Monospaced so a transposed character is visible.
 */
function ExternalId({ provider, id }: { provider: string; id: string }) {
  const [copied, setCopied] = useState(false);
  // GRW-144 — an offline row is an admin's assertion, not a processor's
  // report, and there is no provider dashboard to reconcile it against. Said
  // on the row rather than left to the reader to infer from the word
  // "offline", because the whole value of the marker is that nobody has to.
  const offline = provider === 'offline';

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: offline ? 'oklch(0.52 0.13 65)' : oklch.textFaint, fontWeight: offline ? 700 : 600, textTransform: offline ? 'none' : 'capitalize' }}>
        {offline ? 'Recorded by hand' : provider}
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(id).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            },
            // A clipboard write can be refused (permissions, an insecure
            // origin). Saying nothing is better than claiming it copied.
            () => setCopied(false),
          );
        }}
        title={`Copy ${id}`}
        style={{
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          color: copied ? oklch.accentText : 'oklch(0.45 0.02 155)',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'block',
          textAlign: 'left',
        }}
      >
        {copied ? 'Copied' : id}
      </button>
    </div>
  );
}
