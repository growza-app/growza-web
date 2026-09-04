'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateOnly, formatMoneyMinor } from '../lib/format';
import { inr, oklch } from '../tokens';
import { PrimaryButton, SecondaryButton, TextInput } from './primitives';

/**
 * GRW-148 — "the salon called, they want to continue", as one dialog.
 *
 * The whole point of the story is that an admin taking that call should not
 * have to know which of four things applies. So this modal asks the server
 * first (`GET .../reenrol`) and then STATES the answer: what it is about to
 * do, what is outstanding, which terms carry, and — the first thing an owner
 * asks — that their bookings and customers are not affected.
 *
 * Nothing here is computed locally. Every figure is the preview's, which comes
 * from the same functions the POST acts on, so the dialog cannot promise
 * something the action then does differently.
 */
const METHODS: [string, string][] = [
  ['bank_transfer', 'Bank transfer'],
  ['upi', 'UPI'],
  ['cash', 'Cash'],
  ['cheque', 'Cheque'],
];

const INT4_MAX = 2_147_483_647;
const REQUEST_TIMEOUT_MS = 30_000;

/** FR-01 — the button and the dialog say what will actually happen, not a generic verb. */
const ACTION_COPY: Record<string, { title: string; verb: string; blurb: string }> = {
  reenrol: {
    title: 'Re-enrol this business',
    verb: 'Re-enrol',
    blurb: 'This subscription has ended, so a new one is created on the same plan. The old one stays on file with its invoices.',
  },
  reactivate: {
    title: 'Reactivate this subscription',
    verb: 'Reactivate',
    blurb: 'This subscription is still theirs — it needs what is owed cleared, not replacing.',
  },
  resume: {
    title: 'Resume this subscription',
    verb: 'Resume',
    blurb: 'This subscription was paused by agreement. Resuming puts it straight back to active.',
  },
};

/**
 * FR-01/FR-05 — the label a status earns, or null when the action does not
 * apply at all.
 *
 * Mirrors `reenrolActionFor` in `billing/reenrol.ts`. A copy rather than a
 * shared import because the dashboard is a separate deployable that talks to
 * the API over HTTP; the server refuses anything this gets wrong, so the worst
 * a drift can do is show or hide a button, never perform the wrong action.
 */
export function reenrolActionLabel(status: string): string | null {
  switch (status) {
    case 'CANCELLED':
    case 'EXPIRED':
      return 'Re-enrol';
    case 'SUSPENDED':
    case 'PAST_DUE':
    case 'GRACE_PERIOD':
    case 'PAYMENT_FAILED':
      return 'Reactivate';
    case 'PAUSED':
      return 'Resume';
    default:
      return null;
  }
}

export interface ReenrolPreview {
  subscriptionId: string;
  businessName: string;
  currentStatus: string;
  action: 'reenrol' | 'reactivate' | 'resume';
  planCode: string;
  planName: string | null;
  outstandingMinor: number;
  outstandingInvoices: Array<{ id: string; invoiceNumber: string; periodStart: string; periodEnd: string; outstandingMinor: number }>;
  carriesDiscount: { type: string; value: number; reason: string; endsAt: string | null; amountMinor: number } | null;
  carriesOverrides: Array<{ capabilityKey: string; value: boolean | number; reason: string }>;
  retainedAppointments: number;
  retainedCustomers: number;
  mayRecordPayment: boolean;
}

export interface ReenrolResult {
  action: string;
  created: boolean;
  trading: boolean;
  outstandingMinor: number;
}

function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The same as-typed check `RecordPaymentModal` uses — rupees have two decimal places, and anything else is a typo rather than something to round on the admin's behalf. */
function parseRupees(raw: string): { ok: true; minor: number } | { ok: false; why: string } {
  const text = raw.trim();
  if (text === '') return { ok: false, why: '' };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false, why: 'Enter an amount in rupees and paise — digits, and at most two decimal places.' };
  const minor = Math.round(Number(text) * 100);
  if (minor <= 0) return { ok: false, why: 'Enter an amount greater than zero.' };
  if (minor > INT4_MAX) return { ok: false, why: `That is larger than the biggest amount that can be recorded (${inr(INT4_MAX / 100)}).` };
  return { ok: true, minor };
}

export function ReenrolModal({
  subscriptionId,
  onClose,
  onDone,
}: {
  /** null closes the modal — the same pattern DiscountModal and RecordPaymentModal use. */
  subscriptionId: string | null;
  onClose: () => void;
  onDone: (result: ReenrolResult) => void;
}) {
  const [preview, setPreview] = useState<ReenrolPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [withPayment, setWithPayment] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  const open = subscriptionId !== null;
  const openedFor = useRef<string | null>(null);

  /**
   * Seed and load ONCE per opening, on the transition into open — the same
   * guard RecordPaymentModal needed, and for the same reason: an effect that
   * re-runs while the modal is open wipes half-typed input under the admin's
   * cursor when an unrelated prop settles.
   */
  useEffect(() => {
    if (!open) {
      openedFor.current = null;
      return;
    }
    if (openedFor.current === subscriptionId) return;
    openedFor.current = subscriptionId;

    setPreview(null);
    setLoadError(null);
    setError(null);
    setWithPayment(false);
    setAmount('');
    setMethod('bank_transfer');
    setReference('');
    setPaidAt(localDateTimeValue(new Date()));
    setReason('');

    const controller = new AbortController();
    adminFetch<ReenrolPreview>(`/subscriptions/${subscriptionId}/reenrol`, { signal: controller.signal })
      .then((p) => {
        setPreview(p);
        // Pre-fill with what is actually owed, so the ordinary case is one
        // glance and a reference — but only offered, never assumed: a part
        // payment is a real thing an admin needs to be able to record.
        if (p.outstandingMinor > 0 && p.mayRecordPayment) {
          setWithPayment(true);
          setAmount((p.outstandingMinor / 100).toFixed(2));
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof AdminApiError ? err.message : 'Could not work out what this subscription needs.');
      });
    return () => controller.abort();
  }, [open, subscriptionId]);

  if (!open) return null;

  const copy = preview ? ACTION_COPY[preview.action]! : null;
  const parsedAmount = parseRupees(amount);
  const paidAtDate = paidAt === '' ? null : new Date(paidAt);
  const paidAtValid = paidAtDate !== null && !Number.isNaN(paidAtDate.getTime());
  const future = paidAtValid && paidAtDate.getTime() > Date.now();

  const blocker = !preview
    ? 'Loading…'
    : reason.trim() === ''
      ? 'Enter a reason — it is recorded against your name.'
      : !withPayment
        ? null
        : !parsedAmount.ok
          ? (parsedAmount.why ?? '') || 'Enter the amount received.'
          : !paidAtValid
            ? 'Enter when the payment arrived.'
            : future
              ? 'That is in the future. A payment can only be recorded after it arrived.'
              : reference.trim() === ''
                ? 'Enter the reference from the bank statement.'
                : null;
  const canSave = blocker === null && !saving;

  /** A part payment is allowed — it just will not restore the service, and the dialog says so before the button rather than after. */
  const shortfall = preview && withPayment && parsedAmount.ok ? preview.outstandingMinor - parsedAmount.minor : 0;

  function submit() {
    if (!preview) return;
    setSaving(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    adminFetch<ReenrolResult>(`/subscriptions/${subscriptionId}/reenrol`, {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        reason: reason.trim(),
        ...(withPayment && parsedAmount.ok && paidAtValid
          ? { payment: { amountMinor: parsedAmount.minor, method, reference: reference.trim(), paidAt: paidAtDate!.toISOString() } }
          : {}),
      }),
    })
      .then((result) => {
        onDone(result);
        onClose();
      })
      .catch((err) =>
        setError(
          err instanceof AdminApiError
            ? err.message
            : controller.signal.aborted
              ? 'That took too long to answer. Check the subscription before trying again — it may have gone through.'
              : 'Could not complete this.',
        ),
      )
      .finally(() => {
        clearTimeout(timer);
        setSaving(false);
      });
  }

  const label = (text: string) => (
    <div style={{ fontSize: 12, fontWeight: 800, color: oklch.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{text}</div>
  );

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
      onClick={saving ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(600px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'white',
          borderRadius: 18,
          boxShadow: '0 24px 60px oklch(0.2 0.04 155 / 0.35)',
          animation: 'admin-fade 0.2s ease',
        }}
      >
        <div style={{ padding: '22px 24px 0' }}>
          <h3 id={`${ids}-title`} style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', color: oklch.textStrong }}>
            {copy?.title ?? 'Continue this subscription'}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: oklch.textMuted }}>
            {preview ? `${preview.businessName} — currently ${preview.currentStatus.toLowerCase().replace(/_/g, ' ')}` : 'Working out what this needs…'}
          </p>
        </div>

        <div style={{ padding: '18px 24px 24px', display: 'grid', gap: 16 }}>
          {loadError ? (
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.5 0.18 25)' }}>{loadError}</div>
          ) : !preview ? (
            <div style={{ fontSize: 13.5, color: oklch.textMuted }}>Loading…</div>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13.5, color: oklch.textMuted, lineHeight: 1.5 }}>{copy!.blurb}</p>

              {/* AC-02 / DoD — the first thing an owner asks, answered with
                  counts rather than a reassuring adjective. */}
              <div style={{ background: 'oklch(0.97 0.02 155)', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: oklch.textStrong, fontWeight: 600 }}>
                Their {preview.retainedCustomers.toLocaleString('en-IN')} customers and {preview.retainedAppointments.toLocaleString('en-IN')} bookings are not
                affected — those belong to the business, not to the subscription.
              </div>

              {preview.outstandingMinor > 0 ? (
                <div>
                  {label('Outstanding')}
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'oklch(0.5 0.15 25)' }}>{formatMoneyMinor(preview.outstandingMinor)}</div>
                  {preview.outstandingInvoices.map((i) => (
                    <div key={i.id} style={{ marginTop: 4, fontSize: 12.5, color: oklch.textMuted, fontWeight: 600 }}>
                      {i.invoiceNumber} · {formatDateOnly(i.periodStart)} – {formatDateOnly(i.periodEnd)} · {formatMoneyMinor(i.outstandingMinor)}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: oklch.textMuted, fontWeight: 600 }}>Nothing outstanding.</div>
              )}

              {/* FR-02 — the terms that carry, shown BEFORE saving. This is
                  the half a plain "create a subscription" silently drops. */}
              {preview.action === 'reenrol' ? (
                <div>
                  {label('Carried onto the new subscription')}
                  <div style={{ fontSize: 13, color: oklch.textStrong, fontWeight: 600, lineHeight: 1.6 }}>
                    <div>Plan {preview.planName ?? preview.planCode}</div>
                    <div>
                      {preview.carriesDiscount
                        ? `Discount ${formatMoneyMinor(preview.carriesDiscount.amountMinor)} off — ${preview.carriesDiscount.reason}${
                            preview.carriesDiscount.endsAt ? ` (until ${formatDateOnly(preview.carriesDiscount.endsAt)})` : ' (permanent)'
                          }`
                        : 'No discount — they were on list price.'}
                    </div>
                    {preview.carriesOverrides.length > 0 ? (
                      preview.carriesOverrides.map((o) => (
                        <div key={o.capabilityKey}>
                          {o.capabilityKey} = {String(o.value)} — {o.reason}
                        </div>
                      ))
                    ) : (
                      <div>No per-customer entitlement exceptions.</div>
                    )}
                  </div>
                </div>
              ) : null}

              {preview.mayRecordPayment ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, fontWeight: 700, color: oklch.textStrong }}>
                  <input type="checkbox" checked={withPayment} onChange={(e) => setWithPayment(e.target.checked)} disabled={saving} />
                  Record a payment at the same time
                </label>
              ) : null}

              {withPayment ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div>
                    {label('Amount received (₹)')}
                    <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" disabled={saving} />
                  </div>
                  <div>
                    {label('How it arrived')}
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      disabled={saving}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${oklch.borderStrong}`, fontSize: 14, fontWeight: 600 }}
                    >
                      {METHODS.map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    {label('Reference')}
                    <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque number" disabled={saving} />
                  </div>
                  <div>
                    {label('When it arrived')}
                    <input
                      type="datetime-local"
                      value={paidAt}
                      onChange={(e) => setPaidAt(e.target.value)}
                      disabled={saving}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${oklch.borderStrong}`, fontSize: 14, fontWeight: 600 }}
                    />
                  </div>
                  {shortfall > 0 ? (
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.52 0.13 65)' }}>
                      This is {formatMoneyMinor(shortfall)} short of what is owed. It will be recorded, but the subscription stays as it is until the balance is
                      cleared.
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600 }}>
                    Recorded on your word — no provider will confirm it. The reference is what ties it to a bank statement.
                  </div>
                </div>
              ) : null}

              <div>
                {label('Reason')}
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this is being done" disabled={saving} />
              </div>

              {error ? <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.5 0.18 25)' }}>{error}</div> : null}
              {blocker && blocker !== 'Loading…' ? <div style={{ fontSize: 12.5, color: oklch.textMuted, fontWeight: 600 }}>{blocker}</div> : null}

              <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
                <SecondaryButton onClick={onClose} disabled={saving}>
                  Close
                </SecondaryButton>
                <PrimaryButton onClick={submit} disabled={!canSave}>
                  {saving ? 'Working…' : copy!.verb}
                </PrimaryButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
