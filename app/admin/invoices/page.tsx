'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateOnly, formatMoneyMinor } from '../lib/format';
import { billingStatusLabel, INVOICE_PAYMENT_STATUS_VALUES } from '../lib/billing-status';
import { Card, EmptyState, SecondaryButton, Select, StatusPill, Table, TableRow, type TableColumn } from '../components/primitives';
import { Pagination, type PaginationState } from '../components/Pagination';
import { INITIAL_PAGING, applyPageParams, mergeRows } from '../lib/paging';
import { useAdminSearch } from '../components/SearchContext';
import { DateRangeFilter, useDateRange } from '../components/DateRangeFilter';
import { Icon } from '../icons';
import { oklch } from '../tokens';

/**
 * GRW-119's Invoices screen, on the real `invoice` rows GRW-118 issues.
 *
 * It used to compute GST in the browser from a `GST_RATE = 0.18` constant and
 * invent invoice numbers as `INV-20{41 + i}` — a tax figure invented by a UI,
 * which is the same defect that was already removed from the subscription
 * screen. Every figure here is now read from what the invoice stored, and the
 * rate shown is the rate that was actually applied to it.
 */
const STATUS_OPTIONS = ['All', ...INVOICE_PAYMENT_STATUS_VALUES];

const COLUMNS: TableColumn[] = [
  { label: 'Invoice', width: '0.95fr' },
  { label: 'Business', width: '1.3fr' },
  // Widest column by some way: it holds two formatted dates and an en dash,
  // and at 1.1fr it ran into the Taxable figure beside it.
  { label: 'Period', width: '1.7fr' },
  { label: 'Taxable', width: '0.85fr' },
  { label: 'GST', width: '0.8fr' },
  { label: 'Total', width: '0.9fr' },
  { label: 'Payment', width: '0.95fr' },
  { label: '', width: '50px', right: true },
];

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  businessId: string;
  businessName: string | null;
  planCode: string;
  planName: string | null;
  planVersion: number;
  listPriceMinor: number;
  discountAmountMinor: number;
  taxableAmountMinor: number;
  taxAmountMinor: number;
  totalMinor: number;
  currency: string;
  taxRateBps: number;
  status: string;
  paymentStatus: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
}

interface InvoicePage {
  rows: InvoiceRow[];
  total: number;
}

export default function AdminInvoicesPage() {
  const router = useRouter();
  const { query: search } = useAdminSearch();
  const [paymentStatus, setPaymentStatus] = useState('All');
  const range = useDateRange();
  const [paging, setPaging] = useState<PaginationState>(INITIAL_PAGING);
  /**
   * Jira GRW-140 — what is on screen, which is no longer the same thing as
   * the last response. A numbered page replaces this; "Load more" adds to it.
   */
  const [rows, setRows] = useState<InvoicePage['rows']>([]);
  const [page, setPage] = useState<InvoicePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const trimmedSearch = search.trim();
  const searchTooShort = trimmedSearch.length > 0 && trimmedSearch.length < 2;

  useEffect(() => {
    setPaging((p) => (p.page === 1 ? p : { ...p, page: 1, intent: 'replace' }));
  }, [paymentStatus, trimmedSearch, range.from, range.to]);

  useEffect(() => {
    if (searchTooShort || range.invalid) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (trimmedSearch) params.set('search', trimmedSearch);
    if (paymentStatus !== 'All') params.set('paymentStatus', paymentStatus);
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    applyPageParams(params, paging);

    adminFetch<InvoicePage>(`/invoices?${params}`, { signal: controller.signal })
      .then((result) => {
        setPage(result);
        setRows((prev) => mergeRows(prev, result.rows, paging.intent));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof AdminApiError ? err.message : 'Could not load invoices.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
     
  }, [trimmedSearch, paymentStatus, range.from, range.to, range.invalid, paging, searchTooShort]);

  const hasActiveFilters = paymentStatus !== 'All' || trimmedSearch.length >= 2 || Boolean(range.from || range.to);

  return (
    <div>
      <div style={{ display: 'flex', gap: 9, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ width: 170 }}>
          <Select
            options={STATUS_OPTIONS.map(billingStatusLabel)}
            value={billingStatusLabel(paymentStatus)}
            onChange={(e) => setPaymentStatus(STATUS_OPTIONS[STATUS_OPTIONS.map(billingStatusLabel).indexOf(e.target.value)] ?? 'All')}
          />
        </div>
        <DateRangeFilter range={range} />
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
          <EmptyState icon="invoices" title="No invoices match" sub="Try a different payment status, date range or search term." />
        ) : (
          <EmptyState icon="invoices" title="No invoices yet" sub="One is issued for each subscription when its billing period ends." />
        )
      ) : (
        <>
          <Table
            columns={COLUMNS}
            minWidthPx={1080}
            rows={rows.map((inv) => (
              <TableRow key={inv.id} columns={COLUMNS} onClick={() => router.push(`/admin/invoices/${inv.id}`)}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.3 0.02 155)', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                  {inv.invoiceNumber}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {inv.businessName ?? '—'}
                  </div>
                  <div style={{ fontSize: 11.5, color: oklch.textFaint }}>
                    {inv.planName ?? inv.planCode} · v{inv.planVersion}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: 'oklch(0.5 0.02 155)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {formatDateOnly(inv.periodStart)} – {formatDateOnly(inv.periodEnd)}
                </div>
                <div style={{ fontSize: 13, color: 'oklch(0.45 0.02 155)', fontWeight: 600 }}>{formatMoneyMinor(inv.taxableAmountMinor)}</div>
                <div style={{ fontSize: 13, color: 'oklch(0.45 0.02 155)', fontWeight: 600 }}>{formatMoneyMinor(inv.taxAmountMinor)}</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: 'oklch(0.28 0.02 155)' }}>{formatMoneyMinor(inv.totalMinor)}</div>
                <div>
                  <StatusPill status={billingStatusLabel(inv.paymentStatus)} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/admin/invoices/${inv.id}`);
                    }}
                    aria-label={`Open invoice ${inv.invoiceNumber}`}
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
            ))}
          />
          <Pagination total={page.total} loaded={rows.length} state={paging} onChange={setPaging} />
        </>
      )}
    </div>
  );
}
