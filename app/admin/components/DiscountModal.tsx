'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateOnly } from '../lib/format';
import { Icon } from '../icons';
import { inr, oklch } from '../tokens';
import { ConfirmDialog } from './ConfirmDialog';
import { PrimaryButton, SecondaryButton, TextInput } from './primitives';

/**
 * Customer-specific pricing (GRW-82/113/114) — opened from the subscription
 * screen's "Change price" button.
 *
 * The math mirrors what `setSubscriptionDiscount` does server-side exactly
 * (`src/modules/billing/subscriptions.ts`) so the number an admin sees here
 * before saving is the number that comes back after — but this is a
 * preview, not the source of truth: the server recomputes and validates
 * independently, and refuses (never silently clamps) a discount that works
 * out to more than the list price. The plan's list price is shown, never
 * edited, alongside whatever this customer actually pays (13-platform-
 * administration.md §2.1).
 */
type DiscountType = 'fixed' | 'percent' | 'final';

export interface CurrentDiscount {
  type: DiscountType;
  /** What the admin originally typed — rupees for fixed/final, 0-100 for percent. */
  value: number;
  reason: string;
  startsAt: string | null;
  endsAt: string | null;
}

/**
 * Whole calendar months between two 'YYYY-MM-DD' dates, day-of-month
 * ignored (QA pass 7). Only ever used to prefill the Duration select on
 * reopen — the server is what actually validates and computes the real
 * window (this file's own top comment), so an off-by-a-few-days rounding
 * here has no correctness consequence, only a cosmetic one.
 */
function monthsBetween(startISO: string, endISO: string): number {
  const [sy, sm] = startISO.split('-').map(Number);
  const [ey, em] = endISO.split('-').map(Number);
  return Math.max(1, (ey - sy) * 12 + (em - sm));
}

export interface DiscountModalSubscription {
  id: string;
  listPriceMinor: number;
  discountAmountMinor: number;
  finalPriceMinor: number;
}

/** The full round-trip shape PUT/DELETE .../discount return — matches SubscriptionPanelSubscription's own discount fields exactly, so a caller can spread the response straight onto its existing subscription state with nothing left stale. */
export interface DiscountedSubscription extends DiscountModalSubscription {
  discountType: 'fixed' | 'percent' | 'final' | null;
  discountValue: number | null;
  discountReason: string | null;
  discountEndsAt: string | null;
}

export function DiscountModal({
  businessName,
  planName,
  subscription,
  currentDiscount,
  onClose,
  onSaved,
}: {
  /** null closes the modal — same pattern as the original ported design. */
  businessName: string | null;
  planName?: string;
  subscription: DiscountModalSubscription | null;
  /** The subscription's own discount, prefilled when re-opening on an already-discounted subscription; null starts the form at today's defaults. */
  currentDiscount: CurrentDiscount | null;
  onClose: () => void;
  onSaved: (updated: DiscountedSubscription) => void;
}) {
  const [type, setType] = useState<DiscountType>('fixed');
  const [value, setValue] = useState('200');
  const [duration, setDuration] = useState('6');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Re-seed the form every time the modal OPENS on a (possibly different)
  // subscription — same reset-on-open discipline ConfirmDialog uses, for the
  // same reason: without it, closing this modal on one business and
  // reopening it on another kept the first business's half-typed discount
  // sitting in the form.
  useEffect(() => {
    if (!businessName) return;
    setSaveError(null);
    if (currentDiscount) {
      setType(currentDiscount.type);
      setValue(String(currentDiscount.value));
      setReason(currentDiscount.reason);
      // QA pass 7 (HIGH, confirmed independently twice) — this used to
      // hardcode '3' whenever the discount had any end date at all,
      // silently truncating a 6- or 12-month discount to 3 months on
      // every reopen-and-resave, with nothing in the UI hinting it had
      // changed. Reopening now preselects the discount's OWN original
      // duration (whole months between when it started and when it
      // ends) — the closest of this select's fixed options when one
      // matches exactly, or the real computed value otherwise, so an
      // uncommon duration is shown honestly rather than snapped to the
      // nearest preset.
      setDuration(
        currentDiscount.endsAt && currentDiscount.startsAt
          ? String(monthsBetween(currentDiscount.startsAt, currentDiscount.endsAt))
          : '0',
      );
    } else {
      setType('fixed');
      setValue('200');
      setReason('');
      setDuration('6');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessName, subscription?.id]);

  const listPriceRupees = (subscription?.listPriceMinor ?? 0) / 100;

  const math = useMemo(() => {
    const n = Number(value) || 0;
    let amountMinor = 0;
    if (type === 'fixed') amountMinor = Math.round(n * 100);
    else if (type === 'percent') amountMinor = Math.round(((subscription?.listPriceMinor ?? 0) * n) / 100);
    else amountMinor = (subscription?.listPriceMinor ?? 0) - Math.round(n * 100);
    const listPriceMinor = subscription?.listPriceMinor ?? 0;
    const outOfRange = amountMinor < 0 || amountMinor > listPriceMinor;
    const clamped = Math.max(0, Math.min(listPriceMinor, amountMinor));
    return { amountMinor: clamped, outOfRange, finalMinor: listPriceMinor - clamped };
  }, [type, value, subscription?.listPriceMinor]);

  if (!businessName || !subscription) return null;

  const typeOptions: [DiscountType, string][] = [
    ['fixed', 'Fixed ₹'],
    ['percent', 'Percent %'],
    ['final', 'Final price'],
  ];
  const valueLabel = type === 'fixed' ? 'Discount amount (₹)' : type === 'percent' ? 'Discount percent (%)' : 'Final price (₹)';

  function submit() {
    setSaving(true);
    setSaveError(null);
    adminFetch<DiscountedSubscription>(
      `/subscriptions/${subscription!.id}/discount`,
      {
        method: 'PUT',
        body: JSON.stringify({
          type,
          value: type === 'percent' ? Number(value) || 0 : Math.round((Number(value) || 0) * 100),
          reason,
          durationMonths: duration === '0' ? null : Number(duration),
        }),
      },
    )
      .then((updated) => {
        onSaved(updated);
        onClose();
      })
      .catch((err) => setSaveError(err instanceof AdminApiError ? err.message : 'Could not save this discount.'))
      .finally(() => setSaving(false));
  }

  // QA pass 7 (MEDIUM) — this used to fire straight off the button with a
  // hardcoded reason string ('Reverted to list price'), regardless of why
  // it was actually being removed. That defeated the whole point of this
  // route's `reasonRequired: true` (GRW-98, BR-02: "an unexplained
  // entitlement [or price change] is indistinguishable from a bug") — every
  // removal audited identically, no matter the real reason. Now goes
  // through the same reason-capture ConfirmDialog every other audited
  // mutation on this screen uses (cancel, above; entitlement set/remove in
  // SubscriptionEntitlements.tsx).
  function remove(reason: string) {
    setRemoving(true);
    setRemoveError(null);
    adminFetch<DiscountedSubscription>(`/subscriptions/${subscription!.id}/discount`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    })
      .then((updated) => {
        setRemoveConfirmOpen(false);
        onSaved(updated);
        onClose();
      })
      .catch((err) => setRemoveError(err instanceof AdminApiError ? err.message : 'Could not remove this discount.'))
      .finally(() => setRemoving(false));
  }

  const busy = saving || removing;
  const canSave = reason.trim().length > 0 && !math.outOfRange && !busy;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'oklch(0.2 0.02 155 / 0.5)',
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'white',
          borderRadius: 18,
          boxShadow: '0 24px 60px oklch(0.2 0.04 155 / 0.35)',
          animation: 'admin-fade 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '22px 24px 0' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', color: oklch.textStrong }}>
              Customer-specific pricing
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: oklch.textMuted }}>
              {businessName}
              {planName ? ` · ${planName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              border: `1px solid ${oklch.borderStrong}`,
              background: 'white',
              color: 'oklch(0.45 0.02 155)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: busy ? 'not-allowed' : 'pointer',
              flex: 'none',
            }}
          >
            <Icon name="close" size={17} />
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: 12,
              background: oklch.surfaceSubtle,
              border: `1px solid ${oklch.border}`,
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'oklch(0.45 0.02 155)' }}>Standard plan price</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: oklch.text }}>
              {inr(listPriceRupees)}
              <span style={{ fontSize: 12, fontWeight: 600, color: oklch.textFaint }}>/mo</span>
            </span>
          </div>

          {currentDiscount ? (
            <div style={{ marginTop: 12, fontSize: 12, fontWeight: 600, color: oklch.textFaint }}>
              Currently: {currentDiscount.reason}
              {currentDiscount.endsAt ? ` · ends ${formatDateOnly(currentDiscount.endsAt)}` : ' · permanent'}
            </div>
          ) : null}

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>Discount type</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {typeOptions.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  disabled={busy}
                  onClick={() => setType(v)}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    ...(type === v
                      ? { background: 'oklch(0.31 0.055 158)', color: 'white', border: '1px solid oklch(0.31 0.055 158)' }
                      : { background: 'white', color: 'oklch(0.45 0.02 155)', border: `1px solid ${oklch.borderStrong}` }),
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>{valueLabel}</label>
              <TextInput
                type="number"
                min={0}
                disabled={busy}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                style={{ marginTop: 7, fontSize: 15, fontWeight: 700 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>Duration</label>
              <select
                value={duration}
                disabled={busy}
                onChange={(e) => setDuration(e.target.value)}
                style={{
                  width: '100%',
                  height: 44,
                  marginTop: 7,
                  padding: '0 12px',
                  borderRadius: 11,
                  border: `1px solid ${oklch.borderStrong}`,
                  background: oklch.inputBg,
                  fontSize: 14,
                  fontWeight: 600,
                  outline: 'none',
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                {!['0', '3', '6', '12'].includes(duration) ? (
                  <option value={duration}>
                    {duration} month{duration === '1' ? '' : 's'} (current)
                  </option>
                ) : null}
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12">12 months</option>
                <option value="0">Permanent</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)', display: 'block', marginTop: 16 }}>
              Reason
            </label>
            <TextInput
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Early adopter"
              style={{ marginTop: 7, fontWeight: 500 }}
            />
          </div>

          <div
            style={{
              marginTop: 20,
              borderRadius: 14,
              border: `1px solid ${math.outOfRange ? 'oklch(0.75 0.15 25)' : 'oklch(0.9 0.02 150)'}`,
              background: 'oklch(0.98 0.012 150)',
              padding: '16px 18px',
            }}
          >
            <Row label="List price" value={inr(listPriceRupees)} />
            <Row label="Discount" value={'− ' + inr(math.amountMinor / 100)} valueColor="oklch(0.5 0.15 25)" />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '9px 0 2px',
                borderTop: '1px solid oklch(0.9 0.02 150)',
                marginTop: 5,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 800, color: oklch.textStrong }}>Charged per month</span>
              <span style={{ fontSize: 19, fontWeight: 800, color: oklch.accentText }}>{inr(math.finalMinor / 100)}</span>
            </div>
          </div>

          {math.outOfRange ? (
            <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: 'oklch(0.5 0.15 25)' }}>
              {type === 'final' ? 'The final price entered is above list price.' : 'That discount is larger than the list price itself.'}
            </div>
          ) : null}

          {saveError ? <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: oklch.danger }}>{saveError}</div> : null}
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '14px 24px 22px' }}>
          {currentDiscount ? (
            <SecondaryButton
              danger
              onClick={() => {
                setRemoveError(null);
                setRemoveConfirmOpen(true);
              }}
              disabled={busy}
              style={{ flex: 1, height: 46 }}
            >
              {removing ? 'Removing…' : 'Remove discount'}
            </SecondaryButton>
          ) : (
            <SecondaryButton onClick={onClose} disabled={busy} style={{ flex: 1, height: 46 }}>
              Cancel
            </SecondaryButton>
          )}
          <PrimaryButton onClick={submit} disabled={!canSave} style={{ flex: 1, height: 46, justifyContent: 'center' }}>
            {saving ? 'Saving…' : 'Save discount'}
          </PrimaryButton>
        </div>
      </div>

      <ConfirmDialog
        open={removeConfirmOpen}
        danger
        title="Remove this discount?"
        description={`${businessName} reverts to the plan's standard price of ${inr(listPriceRupees)}/mo. This change is audited.`}
        confirmLabel="Remove discount"
        reasonRequired
        reasonPlaceholder="Why is this discount being removed?"
        loading={removing}
        error={removeError}
        onConfirm={remove}
        onCancel={() => {
          setRemoveConfirmOpen(false);
          setRemoveError(null);
        }}
      />
    </div>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5, padding: '5px 0' }}>
      <span style={{ color: 'oklch(0.5 0.02 155)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontWeight: 700, color: valueColor ?? 'oklch(0.3 0.02 155)' }}>{value}</span>
    </div>
  );
}
