'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../../lib/api';
import { formatDateOnly, formatMoneyMinor } from '../../lib/format';
import { subscriptionStatusLabel } from '../../lib/subscription-status';
import { Card, EmptyState, SecondaryButton, SectionTitle, StatusPill } from '../../components/primitives';
import { oklch } from '../../tokens';

/**
 * The subscription a row on GRW-111's list opens.
 *
 * GRW-112 owns this screen properly — effective entitlements with their
 * provenance, the per-customer override editor GRW-110 built an API for, and
 * cancellation. What it may not do in the meantime is what it used to: look
 * the id up in `data.ts`'s eight invented businesses and, finding no `BZ-1001`,
 * tell an admin their real subscription "may have been removed, or the link is
 * out of date". Once the list stopped being mock, every row led here to that
 * sentence.
 *
 * So this reads the real row and shows only what the row actually says. The
 * invented parts of the ported layout — usage bars against uncounted usage, a
 * Razorpay reference, a hardcoded ₹799, a lifecycle stepper guessing at
 * GRW-84's state machine — are gone rather than banner-flagged; the design for
 * them is still in Admin.dc.html for GRW-112 to build against.
 */
interface Subscription {
  id: string;
  businessId: string;
  planCode: string;
  planVersion: number;
  status: string;
  billingCycle: string;
  listPriceMinor: number;
  discountAmountMinor: number;
  finalPriceMinor: number;
  currency: string;
  startDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  cancelAtPeriodEnd: boolean;
}

interface Business {
  name: string;
  planName: string;
}

export default function SubscriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setMissing(false);

    adminFetch<Subscription>(`/subscriptions/${params.id}`, { signal: controller.signal })
      .then(async (row) => {
        setSubscription(row);
        // The subscription row carries a business id, not a name. Fetched
        // separately rather than widened into the subscription endpoint,
        // which GRW-109's own callers read. GRW-102's detail endpoint wraps
        // its payload in `business` — reading it flat silently produced a
        // "This business" header on a screen that had the name in hand.
        const detail = await adminFetch<{ business: Business }>(`/businesses/${row.businessId}`, { signal: controller.signal });
        setBusiness(detail.business);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // 404 is the one case that genuinely means "no such subscription" —
        // everything else is a failure to load one that may well exist, and
        // must not be reported as absence.
        if (err instanceof AdminApiError && err.status === 404) setMissing(true);
        else setError(err instanceof AdminApiError ? err.message : 'Could not load this subscription.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [params.id]);

  if (loading) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ height: 44, borderRadius: 12, background: oklch.divider, animation: 'admin-fade 1.2s ease infinite alternate' }} />
          ))}
        </div>
      </Card>
    );
  }

  if (missing) {
    return <EmptyState icon="subs" title="Subscription not found" sub="It may have been removed, or the link is out of date." />;
  }

  if (error || !subscription) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 12px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: oklch.textStrong, marginBottom: 10 }}>{error ?? 'Could not load this subscription.'}</div>
          <SecondaryButton onClick={() => router.refresh()}>Retry</SecondaryButton>
        </div>
      </Card>
    );
  }

  const s = subscription;
  const discounted = s.discountAmountMinor > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: oklch.textStrong }}>
              {business?.name ?? 'This business'} · {business?.planName ?? s.planCode}
            </div>
            <div style={{ fontSize: 12.5, color: oklch.textFaint, marginTop: 2 }}>
              Plan version {s.planVersion} · {s.billingCycle} · started {formatDateOnly(s.startDate)}
            </div>
          </div>
          <StatusPill status={subscriptionStatusLabel(s.status)} />
        </div>

        <div style={{ marginTop: 18, borderRadius: 14, border: '1px solid oklch(0.9 0.02 150)', background: 'oklch(0.98 0.012 150)', padding: '16px 18px' }}>
          <PriceRow label="List price" value={formatMoneyMinor(s.listPriceMinor)} />
          <PriceRow
            label="Discount"
            value={discounted ? '− ' + formatMoneyMinor(s.discountAmountMinor) : formatMoneyMinor(0)}
            color={discounted ? 'oklch(0.5 0.15 25)' : undefined}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 5, borderTop: '1px solid oklch(0.9 0.02 150)' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: oklch.textStrong }}>Charged per {s.billingCycle === 'monthly' ? 'month' : s.billingCycle}</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: oklch.accentText }}>{formatMoneyMinor(s.finalPriceMinor)}</span>
          </div>
          {/* GST is calculated on top and is GRW-83's (invoices) to compute and
              record. The old screen showed an 18% line here from a hardcoded
              constant, which is a tax figure invented by a UI. */}
          <div style={{ marginTop: 10, fontSize: 12, color: oklch.textFaint, fontWeight: 600 }}>
            Pre-tax. GST is calculated on top when the invoice is raised (Jira GRW-83).
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Billing period" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <Fact label="Current period" value={`${formatDateOnly(s.currentPeriodStart)} – ${formatDateOnly(s.currentPeriodEnd)}`} />
          <Fact label="Next billing date" value={formatDateOnly(s.nextBillingDate)} />
          <Fact label="Ends at period end" value={s.cancelAtPeriodEnd ? 'Yes' : 'No'} />
        </div>
      </Card>

      <Card>
        <SectionTitle title="Effective entitlements" />
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: oklch.textMuted }}>
          What this business may use — and any per-customer override raising or lowering it — is resolved server-side
          already (Jira GRW-110), but has no screen yet. It lands with <strong style={{ fontWeight: 800 }}>Jira GRW-112</strong>,
          along with cancelling a subscription from here.
        </p>
        <div style={{ marginTop: 14 }}>
          <SecondaryButton onClick={() => router.push(`/admin/businesses/${s.businessId}`)}>Open the business</SecondaryButton>
        </div>
      </Card>
    </div>
  );
}

function PriceRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '5px 0' }}>
      <span style={{ color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 700, color: color ?? 'oklch(0.3 0.02 155)' }}>{value}</span>
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
