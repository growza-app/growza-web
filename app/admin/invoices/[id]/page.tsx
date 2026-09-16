'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../../lib/api';
import { formatDateOnly, formatTimestampDate } from '../../lib/format';
import { billingStatusLabel } from '../../lib/billing-status';
import { Card, EmptyState, SecondaryButton, SectionTitle, StatusPill } from '../../components/primitives';
import { InvoiceBreakdown } from '../../components/InvoiceBreakdown';
import { oklch } from '../../tokens';

/**
 * GRW-119 — one invoice, in full.
 *
 * Its whole job is BR-01: **a total is never shown without its breakdown.**
 * The five figures come from `InvoiceBreakdown`, the one component that lays
 * them out, and every one of them is a stored column — nothing on this page
 * multiplies or adds anything (BR-02).
 *
 * There is no action here, and that is the design: an issued invoice is never
 * recalculated (GRW-118 BR-01), so there is nothing to edit, and the API has
 * no route that would accept an edit if there were.
 */
interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  businessId: string;
  subscriptionId: string;
  planCode: string;
  planVersion: number;
  listPriceMinor: number;
  discountAmountMinor: number;
  taxableAmountMinor: number;
  taxAmountMinor: number;
  totalMinor: number;
  currency: string;
  taxRateBps: number;
  pricesIncludeTax?: boolean;
  status: string;
  paymentStatus: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      adminFetch<InvoiceDetail>(`/invoices/${params.id}`, { signal })
        .then((row) => {
          setInvoice(row);
          setError(null);
          setMissing(false);
          return adminFetch<{ business: { name: string } }>(`/businesses/${row.businessId}`, { signal })
            .then((detail) => setBusinessName(detail.business.name))
            // A missing name is a smaller loss than blocking the invoice.
            .catch(() => undefined);
        })
        .catch((err) => {
          if (signal?.aborted) return;
          if (err instanceof AdminApiError && err.status === 404) setMissing(true);
          else setError(err instanceof AdminApiError ? err.message : 'Could not load this invoice.');
        }),
    [params.id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (missing) {
    return (
      <div>
        <EmptyState icon="invoices" title={`No invoice ${params.id}`} sub="It may have been removed, or the link is out of date." />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <SecondaryButton onClick={() => router.push('/admin/invoices')}>Back to invoices</SecondaryButton>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error}</div>
          <SecondaryButton onClick={() => void load()}>Retry</SecondaryButton>
        </div>
      </Card>
    );
  }

  if (!invoice) {
    return (
      <Card>
        <div style={{ height: 260, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: oklch.textStrong, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
              {invoice.invoiceNumber}
            </div>
            <div style={{ fontSize: 12.5, color: oklch.textFaint, marginTop: 3 }}>
              {businessName ? `${businessName} · ` : ''}
              {invoice.planCode} v{invoice.planVersion} · issued {formatTimestampDate(invoice.issuedAt)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <StatusPill status={billingStatusLabel(invoice.status)} />
            <StatusPill status={billingStatusLabel(invoice.paymentStatus)} />
          </div>
        </div>

        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14 }}>
          <Fact label="Billing period" value={`${formatDateOnly(invoice.periodStart)} – ${formatDateOnly(invoice.periodEnd)}`} />
          <Fact label="Currency" value={invoice.currency} />
          {/* Recorded ON the invoice, not looked up now: the rule that
              produced it may since have been changed or deleted, and this
              invoice must still explain itself (GRW-118 BR-03). */}
          <Fact label="Tax rate applied" value={`${invoice.taxRateBps / 100}%`} />
        </div>
      </Card>

      <Card>
        <SectionTitle title="What this invoice is for" />
        <div style={{ maxWidth: 420 }}>
          <InvoiceBreakdown figures={invoice} />
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 12, lineHeight: 1.55, color: oklch.textFaint }}>
          These are the figures stored when the invoice was issued. A later plan price change, discount edit or tax-rate
          change does not alter them.
        </p>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: oklch.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: oklch.textStrong, marginTop: 5 }}>{value}</div>
    </div>
  );
}
