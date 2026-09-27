'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateOnly, formatMoneyMinor, formatTimestampDate } from '../lib/format';
import { billingStatusLabel } from '../lib/billing-status';
import { Card, EmptyState, SecondaryButton, SectionTitle, StatusPill } from './primitives';
import { InvoiceBreakdown } from './InvoiceBreakdown';
import { AutopayPanel } from './AutopayPanel';
import { oklch } from '../tokens';

/**
 * GRW-119 — business detail's Billing tab, replacing the placeholder GRW-102
 * left there.
 *
 * One business's invoices and payments together, which is the question this
 * tab exists to answer: "what have we charged them, and what have they
 * paid?" Both halves are the same endpoints and the same components the
 * standalone screens use — deliberately not a third variant, because three
 * renderings of a money figure is three chances for one of them to be wrong.
 *
 * Read-only, like both screens it borrows from.
 */
interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  listPriceMinor: number;
  discountAmountMinor: number;
  taxableAmountMinor: number;
  taxAmountMinor: number;
  totalMinor: number;
  taxRateBps: number;
  pricesIncludeTax?: boolean;
  status: string;
  paymentStatus: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
}

interface PaymentRow {
  id: string;
  amountMinor: number;
  refundedAmountMinor: number;
  status: string;
  paymentProvider: string;
  externalPaymentId: string;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
  /** Jira GRW-407 — the bills it paid, and what of it is held on the salon's account. */
  appliedTo?: Array<{ invoiceId: string; invoiceNumber: string; amountMinor: number; refundedMinor?: number; carried: boolean }>;
  onAccountMinor?: number;
  /** Money no bill has taken that nothing will move — for a person to decide. */
  heldMinor?: number;
}

export function BillingTab({ businessId }: { businessId: string; businessName?: string }) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        // Scoped by the business's ID (QA pass 8). This filtered by NAME
        // through `search`, which is a substring match against the business
        // name OR the invoice/payment id — so a business called "Glow" saw
        // every "Glow Salon" row, two businesses sharing a name saw each
        // other's money, and one called "GRW" matched every invoice number.
        // On a screen support works refunds and disputes from, that is the
        // wrong customer's money.
        adminFetch<{ rows: InvoiceRow[] }>(`/invoices?businessId=${encodeURIComponent(businessId)}&pageSize=50`, { signal }),
        adminFetch<{ rows: PaymentRow[] }>(`/payments?businessId=${encodeURIComponent(businessId)}&pageSize=50`, { signal }),
      ])
        .then(([inv, pay]) => {
          setInvoices(inv.rows);
          setPayments(pay.rows);
          setError(null);
        })
        .catch((err) => {
          if (signal?.aborted) return;
          setError(err instanceof AdminApiError ? err.message : 'Could not load billing history.');
        }),
    [businessId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

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

  if (!invoices || !payments) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} style={{ height: 64, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Jira GRW-242 — the mandate, and any new amount the owner has been asked to approve. */}
      <AutopayPanel businessId={businessId} />
      <Card>
        <SectionTitle title={`Invoices (${invoices.length})`} />
        {invoices.length === 0 ? (
          <div style={{ fontSize: 13, color: oklch.textFaint, padding: '6px 0' }}>
            No invoices yet — one is issued when a billing period ends.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {invoices.map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  padding: '13px 14px',
                  borderRadius: 12,
                  border: `1px solid ${oklch.border}`,
                  background: oklch.surfaceSubtle,
                }}
              >
                <div style={{ minWidth: 180, flex: '1 1 220px' }}>
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/invoices/${inv.id}`)}
                    style={{
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: oklch.accentText,
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    }}
                  >
                    {inv.invoiceNumber}
                  </button>
                  <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600, marginTop: 3 }}>
                    {formatDateOnly(inv.periodStart)} – {formatDateOnly(inv.periodEnd)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                    <StatusPill status={billingStatusLabel(inv.status)} />
                    <StatusPill status={billingStatusLabel(inv.paymentStatus)} />
                  </div>
                </div>
                {/* The same breakdown component the detail page and any
                    future PDF use — a total is never shown here alone. */}
                <div style={{ flex: '1 1 260px', maxWidth: 340 }}>
                  <InvoiceBreakdown figures={inv} compact />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle title={`Payments (${payments.length})`} />
        {payments.length === 0 ? (
          <div style={{ fontSize: 13, color: oklch.textFaint, padding: '6px 0' }}>
            No payments yet — they appear as the payment provider reports them.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {payments.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  gap: 14,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '11px 13px',
                  borderRadius: 12,
                  border: `1px solid ${oklch.border}`,
                  background: oklch.surfaceSubtle,
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: 'oklch(0.45 0.02 155)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.externalPaymentId}
                  </div>
                  <div style={{ fontSize: 11.5, color: oklch.textFaint, fontWeight: 600, textTransform: 'capitalize', marginTop: 2 }}>
                    {p.paymentProvider} · {formatTimestampDate(p.paidAt ?? p.createdAt)}
                  </div>
                  {p.failureReason ? <div style={{ fontSize: 11.5, color: oklch.danger, fontWeight: 600, marginTop: 2 }}>{p.failureReason}</div> : null}
                  {(p.appliedTo?.length ?? 0) > 0 || (p.onAccountMinor ?? 0) > 0 ? (
                    <div style={{ fontSize: 12, color: oklch.textMuted, fontWeight: 600, marginTop: 3 }} data-testid="payment-applied">
                      {[
                        ...(p.appliedTo ?? []).map((a) =>
                          a.amountMinor === 0
                            ? `${a.invoiceNumber} ${formatMoneyMinor(a.refundedMinor ?? 0)} refunded`
                            : `Paid ${a.invoiceNumber} ${formatMoneyMinor(a.amountMinor)}${a.carried ? ' (from account)' : ''}${(a.refundedMinor ?? 0) > 0 ? ` (${formatMoneyMinor(a.refundedMinor!)} refunded)` : ''}`,
                        ),
                        ...((p.onAccountMinor ?? 0) > 0 ? [`${formatMoneyMinor(p.onAccountMinor!)} on account — taken off the next bill`] : []),
                      ].join(' · ')}
                    </div>
                  ) : null}
                  {(p.heldMinor ?? 0) > 0 ? (
                    <div style={{ fontSize: 12, color: oklch.danger, fontWeight: 700, marginTop: 3 }} data-testid="payment-held">
                      {formatMoneyMinor(p.heldMinor!)} held — needs a person (no bill will take it on its own)
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
                  {p.refundedAmountMinor > 0 ? (
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'oklch(0.5 0.15 25)' }}>−{formatMoneyMinor(p.refundedAmountMinor)}</span>
                  ) : null}
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'oklch(0.28 0.02 155)' }}>{formatMoneyMinor(p.amountMinor)}</span>
                  <StatusPill status={billingStatusLabel(p.status)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {invoices.length === 0 && payments.length === 0 ? (
        <EmptyState icon="invoices" title="Nothing billed yet" sub="Invoices and payments appear here once this business has been through a billing period." />
      ) : null}
    </div>
  );
}
