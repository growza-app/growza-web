'use client';

import { useEffect, useId, useMemo, useState } from 'react';
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


export interface DiscountModalSubscription {
  id: string;
  listPriceMinor: number;
  discountAmountMinor: number;
  finalPriceMinor: number;
  /** The next bill's extra-branch charge (Jira GRW-161). Absent means none. */
  nextBill?: { branchAmountMinor: number };
}

/**
 * Admin audit 2026-10-09 (M4) — the preview in the API's own arithmetic (`billFor`, billing/pricing.ts).
 *
 * The discount is STORED against the base price (that is what the API validates and saves), but BILLED on base plus
 * extra branches: a percent applies to the whole of it, while a fixed or final discount stays the stored amount and
 * the branches are added on top. The preview used the base price alone, so a salon with branches was shown "₹500 a
 * month" for a final price of ₹500 and then billed ₹500 plus its branches.
 */
export function discountPreview(
  type: 'fixed' | 'percent' | 'final',
  typed: number,
  basePriceMinor: number,
  branchAmountMinor: number,
): { storedMinor: number; outOfRange: boolean; listMinor: number; discountMinor: number; finalMinor: number } {
  const storedRaw =
    type === 'fixed' ? Math.round(typed * 100) : type === 'percent' ? Math.round((basePriceMinor * typed) / 100) : basePriceMinor - Math.round(typed * 100);
  const outOfRange = storedRaw < 0 || storedRaw > basePriceMinor;
  const storedMinor = Math.max(0, Math.min(basePriceMinor, storedRaw));
  const listMinor = basePriceMinor + branchAmountMinor;
  const billed = type === 'percent' ? Math.round((listMinor * typed) / 100) : storedMinor;
  const discountMinor = Math.min(Math.max(0, billed), listMinor);
  return { storedMinor, outOfRange, listMinor, discountMinor, finalMinor: listMinor - discountMinor };
}

/** Today's date in the billing zone (IST), 'YYYY-MM-DD' — the calendar the API's discount windows are written in. */
export function billingToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Review fix — whether "Keep" can be offered. The expiry sweep removes a discount whose end is today or earlier,
 * so keeping that window would save an edit only for it to be swept away; the API refuses it, and so does this.
 */
export function canKeepWindow(current: Pick<CurrentDiscount, 'endsAt'> | null, today: string): boolean {
  return current !== null && (current.endsAt === null || current.endsAt > today);
}

/**
 * Review fix — the `durationMonths` sent beside `keepWindow`. An API without batch E ignores `keepWindow` and reads
 * this alone; `null` there means PERMANENT, so "Keep" on a 6-month discount would have made it run for ever. Whole
 * months from today to the current end, rounded up, so an older API ends it within the same month instead. A
 * permanent discount sends null, which is right on either API.
 */
export function keepFallbackMonths(endsAt: string | null, today: string): number | null {
  if (endsAt === null) return null;
  const [ty = 0, tm = 0, td = 0] = today.split('-').map(Number);
  const [ey = 0, em = 0, ed = 0] = endsAt.split('-').map(Number);
  const months = (ey - ty) * 12 + (em - tm) + (ed > td ? 1 : 0);
  return Math.min(240, Math.max(1, months));
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
  // Jira GRW-288 (AC-05) — these four labels were bare `<label>`s beside their
  // controls: clicking "Duration" focused nothing, and each control read out
  // to a screen reader with no name at all.
  const fieldId = useId();
  const typeLabelId = `${fieldId}-type`;
  const valueId = `${fieldId}-value`;
  const durationId = `${fieldId}-duration`;
  const reasonId = `${fieldId}-reason`;
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
      // Admin audit 2026-10-09 (M6) — an existing discount keeps its window unless the admin picks a new one. QA
      // pass 7 preselected its original length instead (6 months), which was right about the number and wrong about
      // the date: every save restarted that length from today, so fixing a typo in April moved a June end to
      // October. "Keep" sends `keepWindow`, and the API leaves the start and end exactly as they are. A window that
      // has already closed cannot be kept (review fix), so that edit starts a new one.
      setDuration(canKeepWindow(currentDiscount, billingToday()) ? 'keep' : '6');
    } else {
      setType('fixed');
      setValue('200');
      setReason('');
      setDuration('6');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessName, subscription?.id]);

  const listPriceRupees = (subscription?.listPriceMinor ?? 0) / 100;

  const branchAmountMinor = subscription?.nextBill?.branchAmountMinor ?? 0;
  const math = useMemo(() => {
    const p = discountPreview(type, Number(value) || 0, subscription?.listPriceMinor ?? 0, branchAmountMinor);
    return { amountMinor: p.discountMinor, outOfRange: p.outOfRange, finalMinor: p.finalMinor };
  }, [type, value, subscription?.listPriceMinor, branchAmountMinor]);

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
          durationMonths:
            duration === 'keep' ? keepFallbackMonths(currentDiscount?.endsAt ?? null, billingToday()) : duration === '0' ? null : Number(duration),
          keepWindow: duration === 'keep',
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
  // The API takes a whole-number percent (`int4NonNegative`). 12.5 used to preview happily and then fail with a
  // generic "expected integer" — refused here instead, where the admin can still fix it.
  const notWholePercent = type === 'percent' && value.trim() !== '' && !Number.isInteger(Number(value));
  const canSave = reason.trim().length > 0 && !math.outOfRange && !notWholePercent && !busy;

  return (
    <div
      className="admin-dialog-backdrop"
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
            {/* A choice of buttons, not one control, so nothing for a <label>
                to point at: the group is named by the heading instead. */}
            <div id={typeLabelId} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>
              Discount type
            </div>
            <div role="group" aria-labelledby={typeLabelId} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginTop: 16 }}>
            <div>
              <label htmlFor={valueId} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>
                {valueLabel}
              </label>
              <TextInput
                id={valueId}
                type="number"
                min={0}
                step={type === 'percent' ? 1 : 0.01}
                disabled={busy}
                value={value}
                aria-invalid={notWholePercent || undefined}
                aria-describedby={notWholePercent ? `${valueId}-whole` : undefined}
                onChange={(e) => setValue(e.target.value)}
                style={{ marginTop: 7, fontSize: 15, fontWeight: 700 }}
              />
              {notWholePercent ? (
                <p id={`${valueId}-whole`} role="alert" style={{ margin: '6px 0 0', fontSize: 12.5, color: 'oklch(0.5 0.17 25)' }}>
                  Use a whole number — for example 12 or 13, not 12.5.
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor={durationId} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>
                Duration
              </label>
              <select
                id={durationId}
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
                {currentDiscount && canKeepWindow(currentDiscount, billingToday()) ? (
                  <option value="keep">
                    {currentDiscount.endsAt ? `Keep — ends ${formatDateOnly(currentDiscount.endsAt)}` : 'Keep — permanent'}
                  </option>
                ) : null}
                {/* With a discount already running these restart from today, and the labels say so. */}
                <option value="3">{currentDiscount ? '3 months from today' : '3 months'}</option>
                <option value="6">{currentDiscount ? '6 months from today' : '6 months'}</option>
                <option value="12">{currentDiscount ? '12 months from today' : '12 months'}</option>
                <option value="0">Permanent</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor={reasonId} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)', display: 'block', marginTop: 16 }}>
              Reason
            </label>
            <TextInput
              id={reasonId}
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
            {branchAmountMinor > 0 ? <Row label="Extra branches" value={'+ ' + inr(branchAmountMinor / 100)} /> : null}
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
