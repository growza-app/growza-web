'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateOnly, formatMoneyMinor } from '../lib/format';
import { isTerminalSubscriptionStatus, subscriptionStatusLabel } from '../lib/subscription-status';
import { Card, EmptyState, SecondaryButton, SectionTitle, StatusPill } from './primitives';
import { ConfirmDialog } from './ConfirmDialog';
import { DiscountModal, type CurrentDiscount } from './DiscountModal';
import { SubscriptionEntitlements } from './SubscriptionEntitlements';
import { oklch } from '../tokens';

/**
 * One subscription, in full (GRW-112) — pricing, billing period, effective
 * entitlements with provenance, and cancellation.
 *
 * Rendered by two hosts: the standalone `/admin/subscriptions/[id]` page, and
 * the Subscription tab on business detail, which support opens during a
 * billing call. One component rather than two, because the previous split —
 * headline figures on the business page, everything else on the subscription
 * page — is how two screens end up describing the same account differently.
 */
export interface SubscriptionPanelSubscription {
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
  /** Null together — see migration 0025's own CHECK. Null means no discount, on list price. */
  discountType: 'fixed' | 'percent' | 'final' | null;
  discountValue: number | null;
  discountReason: string | null;
  discountStartsAt: string | null;
  discountEndsAt: string | null;
}

export function SubscriptionPanel({
  subscriptionId,
  canManage,
  /** Shown in the heading when the host already knows them — omitted, the panel just leads with the plan code. */
  businessName,
  planName,
  onChanged,
}: {
  subscriptionId: string;
  canManage: boolean;
  businessName?: string;
  planName?: string;
  /** Called after a status change, so a host showing the same status elsewhere can refresh it. */
  onChanged?: () => void;
}) {
  const [subscription, setSubscription] = useState<SubscriptionPanelSubscription | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) =>
      adminFetch<SubscriptionPanelSubscription>(`/subscriptions/${subscriptionId}`, { signal })
        .then((row) => {
          setSubscription(row);
          setError(null);
          setMissing(false);
        })
        .catch((err) => {
          if (signal?.aborted) return;
          // 404 is the only answer that means "no such subscription".
          // Everything else is a failure to load one that may well exist,
          // and must not be reported as absence.
          if (err instanceof AdminApiError && err.status === 404) setMissing(true);
          else setError(err instanceof AdminApiError ? err.message : 'Could not load this subscription.');
        }),
    [subscriptionId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function cancel(reason: string) {
    setCancelling(true);
    setCancelError(null);
    adminFetch<SubscriptionPanelSubscription>(`/subscriptions/${subscriptionId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ reason, status: 'CANCELLED' }),
    })
      .then((row) => {
        setSubscription(row);
        setCancelOpen(false);
        onChanged?.();
      })
      .catch((err) => setCancelError(err instanceof AdminApiError ? err.message : 'Could not cancel this subscription.'))
      .finally(() => setCancelling(false));
  }

  if (missing) {
    return <EmptyState icon="subs" title="Subscription not found" sub="It may have been removed, or the link is out of date." />;
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

  if (!subscription) {
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

  const s = subscription;
  const discounted = s.discountAmountMinor > 0;
  const status = subscriptionStatusLabel(s.status);
  const terminal = isTerminalSubscriptionStatus(s.status);
  // Reopening the modal on an already-discounted subscription prefills it
  // with what's actually there — discountValue is minor-unit rupees for
  // fixed/final (matching the modal's own rupee-denominated input) and a
  // raw 0-100 for percent, so only the first two need the /100 conversion.
  const currentDiscount: CurrentDiscount | null =
    s.discountType && s.discountValue !== null && s.discountReason !== null
      ? {
          type: s.discountType,
          value: s.discountType === 'percent' ? s.discountValue : s.discountValue / 100,
          reason: s.discountReason,
          startsAt: s.discountStartsAt,
          endsAt: s.discountEndsAt,
        }
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: oklch.textStrong }}>
              {businessName ? `${businessName} · ` : ''}
              {planName ?? s.planCode}
            </div>
            <div style={{ fontSize: 12.5, color: oklch.textFaint, marginTop: 2 }}>
              Plan version {s.planVersion} · {s.billingCycle} · started {formatDateOnly(s.startDate)}
            </div>
          </div>
          <StatusPill status={status} />
        </div>

        <div style={{ marginTop: 18, borderRadius: 14, border: '1px solid oklch(0.9 0.02 150)', background: 'oklch(0.98 0.012 150)', padding: '16px 18px' }}>
          <PriceRow label="List price" value={formatMoneyMinor(s.listPriceMinor)} />
          <PriceRow
            label="Discount"
            value={discounted ? '− ' + formatMoneyMinor(s.discountAmountMinor) : formatMoneyMinor(0)}
            color={discounted ? 'oklch(0.5 0.15 25)' : undefined}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 5, borderTop: '1px solid oklch(0.9 0.02 150)' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: oklch.textStrong }}>
              Charged per {s.billingCycle === 'monthly' ? 'month' : s.billingCycle}
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: oklch.accentText }}>{formatMoneyMinor(s.finalPriceMinor)}</span>
          </div>
          {/* GST is calculated on top and is GRW-83's to compute and record.
              This card used to show an 18% line from a hardcoded frontend
              constant — a tax figure invented by a UI. */}
          <div style={{ marginTop: 10, fontSize: 12, color: oklch.textFaint, fontWeight: 600 }}>
            Pre-tax. GST is calculated on top when the invoice is raised (Jira GRW-83).
          </div>
          {discounted && s.discountReason ? (
            <div style={{ marginTop: 10, fontSize: 12, color: 'oklch(0.5 0.15 25)', fontWeight: 700 }}>
              {s.discountReason}
              {/* §2.1's own line: "the subscription screen says so before it
                  happens" — a discount that reverts on its own should never
                  come as a surprise the day it does. */}
              {s.discountEndsAt ? ` — reverts to list price on ${formatDateOnly(s.discountEndsAt)}` : ' — permanent'}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 16, flexWrap: 'wrap' }}>
          <SecondaryButton
            danger
            disabled={!canManage || terminal}
            onClick={() => {
              setCancelError(null);
              setCancelOpen(true);
            }}
            title={
              terminal
                ? `This subscription is already ${status.toLowerCase()}.`
                : !canManage
                  ? 'Cancelling needs the subscription-manage permission.'
                  : undefined
            }
          >
            Cancel subscription
          </SecondaryButton>
          <SecondaryButton
            disabled={!canManage || terminal}
            onClick={() => setDiscountOpen(true)}
            title={
              terminal
                ? `This subscription is already ${status.toLowerCase()}.`
                : !canManage
                  ? 'Changing a price needs the subscription-manage permission.'
                  : undefined
            }
          >
            {discounted ? 'Change price' : 'Add discount'}
          </SecondaryButton>
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

      <SubscriptionEntitlements subscriptionId={s.id} canManage={canManage} isOpen={!terminal} statusLabel={status} />

      <ConfirmDialog
        open={cancelOpen}
        danger
        title={`Cancel ${businessName ? `${businessName}'s` : 'this'} subscription?`}
        // Says what it does AND what it does not: cancelling here takes effect
        // now, and there is no "cancel at the end of the period" until
        // GRW-84's lifecycle machine exists. Offering a control that quietly
        // did one when an admin meant the other is worse than saying so.
        description="This takes effect immediately: the subscription becomes cancelled, and any per-customer entitlement overrides on it stop applying. Cancelling is final — a cancelled subscription cannot be reopened, and the business would need a new one. Scheduling a cancellation for the end of the billing period isn't built yet (Jira GRW-84). This change is audited."
        confirmLabel="Cancel subscription"
        reasonRequired
        reasonPlaceholder="Why is this being cancelled?"
        loading={cancelling}
        error={cancelError}
        onConfirm={cancel}
        onCancel={() => {
          setCancelOpen(false);
          setCancelError(null);
        }}
      />

      <DiscountModal
        businessName={discountOpen ? (businessName ?? 'This business') : null}
        planName={planName}
        subscription={discountOpen ? s : null}
        currentDiscount={discountOpen ? currentDiscount : null}
        onClose={() => setDiscountOpen(false)}
        onSaved={(updated) => {
          setSubscription((prev) => (prev ? { ...prev, ...updated } : prev));
          onChanged?.();
        }}
      />
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
