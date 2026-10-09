'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateOnly, formatDateTime, formatMoneyMinor } from '../lib/format';
import { isTerminalSubscriptionStatus, subscriptionStatusLabel } from '../lib/subscription-status';
import { Card, EmptyState, SecondaryButton, SectionTitle, StatusPill } from './primitives';
import { ConfirmDialog } from './ConfirmDialog';
import { BranchPriceDialog } from './BranchPriceDialog';
import { SubscriptionPriceBox } from './SubscriptionPriceBox';
import { DiscountModal, type CurrentDiscount } from './DiscountModal';
import { RecordPaymentModal } from './RecordPaymentModal';
import { ReenrolModal, reenrolActionLabel } from './ReenrolModal';
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
  /** GRW-121 — when the billing worker will next act. Null for a healthy subscription. */
  nextActionAt: string | null;
  /** Jira GRW-161 — pinned plan price per extra branch, and this customer's own if support set one. */
  branchAddonMinor?: number;
  branchesIncluded?: number;
  branchAddonOverrideMinor?: number | null;
  branchAddonOverrideReason?: string | null;
  /** Jira GRW-161 — the next invoice on today's open branches, worked out by the invoice generator's own pricing. */
  nextBill?: {
    basePriceMinor: number;
    openBranches: number;
    extraBranches: number;
    branchAddonMinor: number;
    branchAmountMinor: number;
    listPriceMinor: number;
    discountAmountMinor: number;
    finalPriceMinor: number;
  };
  /**
   * What this status MEANS, in billing's own words (`STATE_ACCESS`).
   *
   * Optional because the business-detail host renders this panel from a
   * response shape that predates it; absent, the banner simply does not show
   * rather than the panel guessing.
   */
  access?: { summary: string; restricted: boolean };
}

export function SubscriptionPanel({
  subscriptionId,
  canManage,
  canRecordPayment = false,
  canDiscount = false,
  /** Shown in the heading when the host already knows them — omitted, the panel just leads with the plan code. */
  businessName,
  planName,
  onChanged,
  onReplaced,
}: {
  subscriptionId: string;
  canManage: boolean;
  /**
   * `admin.payment.record` — deliberately its own prop rather than folded
   * into `canManage`. Asserting money arrived is a separate permission from
   * changing a subscription (GRW-144), and a UI that implied otherwise would
   * offer a button the server then refuses. Defaults to false: a host that
   * has not thought about it shows no button, which is the safe direction.
   */
  canRecordPayment?: boolean;
  /**
   * Jira GRW-475 — `admin.discount.manage`, which is what the discount routes now check. The permission sat in the
   * role editor while the routes checked `subscription.manage`, so a role without it could still give 100% off.
   */
  canDiscount?: boolean;
  businessName?: string;
  planName?: string;
  /** Called after a status change, so a host showing the same status elsewhere can refresh it. */
  onChanged?: () => void;
  /**
   * Re-enrolling a cancelled subscription creates a NEW one. The host decides where that leads — the subscription
   * page moves to it; the business page needs nothing, because its own refetch (`onChanged`) already picks it up.
   */
  onReplaced?: (subscriptionId: string) => void;
}) {
  const [subscription, setSubscription] = useState<SubscriptionPanelSubscription | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  /** Jira GRW-161 — this customer's price per extra branch. */
  const [branchPriceOpen, setBranchPriceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [recordedNote, setRecordedNote] = useState<string | null>(null);
  const [reenrolOpen, setReenrolOpen] = useState(false);
  /** GRW-152 — the explicit "forfeit the rest of the paid month" choice inside the cancel dialog. */
  const [endNow, setEndNow] = useState(false);

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

  /**
   * GRW-152 — cancelling runs to the end of the month they already paid for.
   *
   * Under arrears, cancelling immediately was defensible: the month had not
   * been paid for. Under GRW-150 the salon has already paid for the month they
   * are in, so cutting them off mid-month takes money for a service withdrawn.
   * End-of-period is what cancelling IS; ending it now is a second, explicit
   * choice that says what it costs.
   *
   * `scheduled` flips the whole control into its opposite — a subscription
   * already ending at the boundary offers to keep it instead, because that is
   * the only useful thing left to do to it.
   */
  function cancel(reason: string) {
    const scheduled = subscription?.cancelAtPeriodEnd === true;
    setCancelling(true);
    setCancelError(null);

    // POST, not PATCH: this route SCHEDULES something rather than patching a
    // field, and a PATCH 404s — which the panel would have shown as the
    // useless "could not change this subscription". Caught by the integration
    // test, which had the same mistake.
    const atPeriodEnd = (cancelFlag: boolean) =>
      adminFetch<unknown>(`/subscriptions/${subscriptionId}/cancel-at-period-end`, {
        method: 'POST',
        body: JSON.stringify({ reason, cancel: cancelFlag }),
      });

    const request = scheduled
      ? atPeriodEnd(false)
      : endNow
        ? adminFetch<unknown>(`/subscriptions/${subscriptionId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ reason, status: 'CANCELLED' }),
          })
        : atPeriodEnd(true);

    request
      .then(() => {
        // Re-read rather than trusting the response shape: the three routes
        // above return different bodies, and the panel renders one type.
        void load();
        setCancelOpen(false);
        setEndNow(false);
        onChanged?.();
      })
      .catch((err) => setCancelError(err instanceof AdminApiError ? err.message : 'Could not change this subscription.'))
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
  const discounted = (s.nextBill?.discountAmountMinor ?? s.discountAmountMinor) > 0;
  const status = subscriptionStatusLabel(s.status);
  const terminal = isTerminalSubscriptionStatus(s.status);
  const reenrolLabel = reenrolActionLabel(s.status);
  /** GRW-152 — cancelling schedules the end; this is a subscription still trading with that end already set. */
  const scheduledToEnd = s.cancelAtPeriodEnd && !terminal;
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
            <div className="admin-name" style={{ fontSize: 18, fontWeight: 800, color: oklch.textStrong }}>
              {businessName ? `${businessName} · ` : ''}
              {planName ?? s.planCode}
            </div>
            <div style={{ fontSize: 12.5, color: oklch.textFaint, marginTop: 2 }}>
              Plan version {s.planVersion} · {s.billingCycle} · started {formatDateOnly(s.startDate)}
            </div>
          </div>
          <StatusPill status={status} />
        </div>

        <SubscriptionPriceBox s={s} />

        <div style={{ display: 'flex', gap: 9, marginTop: 16, flexWrap: 'wrap' }}>
          <SecondaryButton
            danger={!scheduledToEnd}
            disabled={!canManage || terminal}
            onClick={() => {
              setCancelError(null);
              setEndNow(false);
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
            {scheduledToEnd ? 'Keep subscription' : 'Cancel subscription'}
          </SecondaryButton>
          <SecondaryButton
            disabled={!canDiscount || terminal}
            onClick={() => setDiscountOpen(true)}
            title={
              terminal
                ? `This subscription is already ${status.toLowerCase()}.`
                : !canDiscount
                  ? 'Changing a price needs the discount permission.'
                  : undefined
            }
          >
            {discounted ? 'Change price' : 'Add discount'}
          </SecondaryButton>
          <SecondaryButton
            disabled={!canManage || terminal}
            onClick={() => setBranchPriceOpen(true)}
            title={terminal ? `This subscription is already ${status.toLowerCase()}.` : !canManage ? 'Changing a price needs the subscription-manage permission.' : undefined}
          >
            Branch price
          </SecondaryButton>
          {/* GRW-144. Shown only to an admin who actually holds
              `admin.payment.record`, rather than shown-and-disabled: unlike
              cancel and discount (which every subscription-manager has and
              is only blocked by the subscription's state), this permission
              is one most admins will never hold, and a permanently greyed
              button on their screen is noise, not information. */}
          {canRecordPayment ? (
            <SecondaryButton
              disabled={terminal}
              onClick={() => setPaymentOpen(true)}
              title={terminal ? `This subscription is already ${status.toLowerCase()}.` : undefined}
            >
              Record a payment
            </SecondaryButton>
          ) : null}
          {/* GRW-148 — FR-01/FR-05. Present only where it means something: a
              subscription that is already trading normally has nothing to
              re-enrol, and the server refuses it with `nothing_to_do`, so
              offering the button there would be a button that 409s. The label
              is the action it will actually perform. */}
          {reenrolLabel ? (
            <SecondaryButton
              disabled={!canManage}
              onClick={() => setReenrolOpen(true)}
              title={!canManage ? 'This needs the subscription-manage permission.' : undefined}
            >
              {reenrolLabel}
            </SecondaryButton>
          ) : null}
        </div>
      </Card>

      {/* What the status actually DOES, said out loud.
          The screen used to show a pill and nothing else, so an admin who
          cancelled a subscription saw a word change colour and had no way to
          tell whether anything had happened — which is exactly how it was
          reported. The words come from billing's own STATE_ACCESS table, so
          this and the restriction the engine applies cannot drift apart. */}
      {/* FR-03 — a subscription that is ending says so, with the date. Without
          this the only trace is a status pill that still reads Active, which is
          true and useless: the salon is trading and also leaving. */}
      {scheduledToEnd ? (
        <Card>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.52 0.13 65)' }}>
            Ends on {formatDateOnly(s.currentPeriodEnd)}
          </div>
          <div style={{ fontSize: 12.5, color: oklch.textMuted, marginTop: 6, lineHeight: 1.5 }}>
            Still trading until then — they have paid for this month. Billing stops after it, and nothing is deleted.
          </div>
        </Card>
      ) : null}

      {s.access?.restricted ? (
        <Card>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.5 0.15 25)' }}>{s.access.summary}</div>
          <div style={{ fontSize: 12.5, color: oklch.textMuted, marginTop: 6, lineHeight: 1.5 }}>
            New bookings are refused, walk-ins are off and reminders are not sent. Nothing has been deleted — existing data and past
            appointments are untouched.
          </div>
        </Card>
      ) : null}

      {/* Shown on the screen rather than in a toast: a part payment that did
          not restore the subscription is a state the admin has to act on, and
          it must not vanish after three seconds. */}
      {recordedNote ? (
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.5 0.13 65)' }}>{recordedNote}</div>
            <SecondaryButton onClick={() => setRecordedNote(null)}>Dismiss</SecondaryButton>
          </div>
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="Billing period" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 14 }}>
          <Fact label="Current period" value={`${formatDateOnly(s.currentPeriodStart)} – ${formatDateOnly(s.currentPeriodEnd)}`} />
          {/* Terminal means it will never bill again; `next_billing_date`
              keeps its last value, and showing it reads as though the
              cancellation did not take. */}
          <Fact label="Next billing date" value={terminal ? 'Not billing' : formatDateOnly(s.nextBillingDate)} />
          <Fact label="Ends at period end" value={s.cancelAtPeriodEnd ? 'Yes' : 'No'} />
          {/* "No action scheduled" is a real statement, not a blank — an
              admin looking at a failing subscription needs to know whether
              anything is going to happen and when (GRW-121). */}
          <Fact
            label="Next billing action"
            value={s.nextActionAt ? formatDateTime(s.nextActionAt) : 'No action scheduled'}
          />
        </div>
      </Card>

      <SubscriptionEntitlements subscriptionId={s.id} canManage={canManage} isOpen={!terminal} statusLabel={status} />

      <ConfirmDialog
        open={cancelOpen}
        danger
        title={
          scheduledToEnd
            ? 'Keep this subscription running?'
            : `Cancel ${businessName ? `${businessName}'s` : 'this'} subscription?`
        }
        /* GRW-152 — this used to say cancelling took effect immediately, and
           that scheduling it for the period end "isn't built yet". That was
           false: the machinery existed and worked, and no screen called it.
           It now says what actually happens. */
        description={
          scheduledToEnd
            ? `This subscription is set to end on ${formatDateOnly(s.currentPeriodEnd)}. Keeping it cancels that, and billing continues as normal. This change is audited.`
            : `They have already paid for the month they are in, so cancelling lets them keep working until ${formatDateOnly(s.currentPeriodEnd)} and ends the subscription then. Their bookings and customers are never affected either way, and a cancelled business can be brought back later with Re-enrol, which carries their discount and any entitlement exceptions across. This change is audited.`
        }
        confirmLabel={scheduledToEnd ? 'Keep subscription' : endNow ? 'End it now' : 'Cancel at period end'}
        reasonRequired
        reasonPlaceholder="Why is this being cancelled?"
        loading={cancelling}
        error={cancelError}
        onConfirm={cancel}
        onCancel={() => {
          setCancelOpen(false);
          setCancelError(null);
          setEndNow(false);
        }}
      >
        {/* FR-02 — ending it now is possible, and says what it costs. Inside
            the same dialog rather than behind a second one: it is the same
            decision with a different date, and two dialogs would make an admin
            choose before knowing what either does. */}
        {scheduledToEnd ? null : (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, fontWeight: 600, color: oklch.textStrong }}>
            <input type="checkbox" checked={endNow} onChange={(e) => setEndNow(e.target.checked)} disabled={cancelling} style={{ marginTop: 2 }} />
            <span>End it now instead — the rest of the month they have paid for is forfeited, and no refund is issued.</span>
          </label>
        )}
      </ConfirmDialog>

      {/* Jira GRW-161 — this customer's own price per extra branch, with the reason every price change needs. */}
      <BranchPriceDialog
        open={branchPriceOpen}
        subscriptionId={subscriptionId}
        planAddonMinor={s.branchAddonMinor ?? 0}
        branchesIncluded={s.branchesIncluded ?? 1}
        currentMinor={s.branchAddonOverrideMinor ?? s.branchAddonMinor ?? 0}
        onClose={() => setBranchPriceOpen(false)}
        onSaved={() => {
          setBranchPriceOpen(false);
          void load();
          onChanged?.();
        }}
      />

      <DiscountModal
        businessName={discountOpen ? (businessName ?? 'This business') : null}
        planName={planName}
        subscription={discountOpen ? s : null}
        currentDiscount={discountOpen ? currentDiscount : null}
        onClose={() => setDiscountOpen(false)}
        onSaved={() => {
          // Re-read, as every other save on this panel does. Merging the reply kept the stale `nextBill`, which the
          // price card reads first — so the old discount, the old total and "Add discount" stayed on screen.
          void load();
          onChanged?.();
        }}
      />

      <ReenrolModal
        subscriptionId={reenrolOpen ? subscriptionId : null}
        onClose={() => setReenrolOpen(false)}
        onDone={(result) => {
          // Reloading THIS id after a re-enrol showed the old subscription, still Cancelled with Re-enrol live — so it
          // looked as if nothing happened, and a second press got 409 subscription_exists.
          if (onReplaced && result.created && result.subscription.id !== subscriptionId) onReplaced(result.subscription.id);
          else void load();
          onChanged?.();
          // Same reasoning as the payment note: a part payment that did NOT
          // restore the subscription is a state the admin has to act on, and
          // must not vanish with a toast.
          setRecordedNote(
            result.trading
              ? null
              : `Recorded, but ${formatMoneyMinor(result.outstandingMinor)} is still outstanding — the subscription stays as it is until the balance is cleared.`,
          );
        }}
      />

      <RecordPaymentModal
        businessName={paymentOpen ? (businessName ?? 'This business') : null}
        subscription={paymentOpen ? s : null}
        onClose={() => setPaymentOpen(false)}
        onRecorded={(result) => {
          // Refetched rather than patched from the response: recording a
          // payment can move the status and clear the dunning clock, and the
          // 201 body is the payment, not the subscription.
          void load();
          onChanged?.();
          // A part payment is recorded but does NOT restore the subscription.
          // The modal closes either way, so this is the only place that says
          // what actually happened — silence would read as "handled".
          if (!result.recovered) setRecordedNote(result.detail);
        }}
      />
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
