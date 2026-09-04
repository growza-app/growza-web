'use client';

import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Icon } from '../icons';
import { inr, oklch } from '../tokens';
import { PrimaryButton, SecondaryButton, TextInput } from './primitives';

/**
 * Recording a payment that arrived outside the payment provider (GRW-144) —
 * a bank transfer, a UPI collect, cash, a cheque.
 *
 * This is the one screen in the product where a human asserts money arrived
 * and the system believes them. Nothing here is a preview of a calculation
 * the server will redo (as DiscountModal is): every field is testimony. So
 * the form asks for the two things testimony needs to be worth anything —
 * a reference that ties it to a bank statement, and a reason — and says
 * plainly, above the button, that this is being recorded on the admin's word.
 *
 * The server validates all of it again and is the only thing that decides;
 * the checks here exist to stop a typo becoming a 400, not to be trusted.
 */
const METHODS: [string, string][] = [
  ['bank_transfer', 'Bank transfer'],
  ['upi', 'UPI'],
  ['cash', 'Cash'],
  ['cheque', 'Cheque'],
];

export interface RecordPaymentSubscription {
  id: string;
  finalPriceMinor: number;
  currency: string;
}

/**
 * `datetime-local` wants 'YYYY-MM-DDTHH:mm' in the *browser's* zone, and
 * `toISOString()` gives UTC — so this cannot go through toISOString, which
 * is the classic way this input ends up hours off. Built from the local
 * getters instead, and read back with `new Date(value)`, which parses a
 * zoneless datetime-local string as local time. Round trip stays honest.
 */
function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RecordPaymentModal({
  businessName,
  subscription,
  onClose,
  onRecorded,
}: {
  /** null closes the modal — the same pattern DiscountModal uses. */
  businessName: string | null;
  subscription: RecordPaymentSubscription | null;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed on every open, so a half-typed reference from one business can
  // never be submitted against another (DiscountModal's own discipline, and
  // the stakes are higher here — that field is what a finance team matches
  // against a bank statement).
  useEffect(() => {
    if (!businessName || !subscription) return;
    setAmount(String(subscription.finalPriceMinor / 100));
    setMethod('bank_transfer');
    setReference('');
    setPaidAt(localDateTimeValue(new Date()));
    setReason('');
    setError(null);
  }, [businessName, subscription?.id, subscription?.finalPriceMinor]);

  if (!businessName || !subscription) return null;

  const rupees = Number(amount);
  // Guard the three ways this can be wrong separately, because "amount is
  // invalid" tells an admin nothing about which one they hit.
  const amountValid = Number.isFinite(rupees) && rupees > 0 && Number.isInteger(Math.round(rupees * 100));
  const partial = amountValid && Math.round(rupees * 100) < subscription.finalPriceMinor;
  const overpaid = amountValid && Math.round(rupees * 100) > subscription.finalPriceMinor;
  const future = paidAt !== '' && new Date(paidAt).getTime() > Date.now();
  const canSave = amountValid && !future && reference.trim().length > 0 && reason.trim().length > 0 && paidAt !== '' && !saving;

  function submit() {
    setSaving(true);
    setError(null);
    adminFetch(`/subscriptions/${subscription!.id}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        amountMinor: Math.round(Number(amount) * 100),
        method,
        reference: reference.trim(),
        paidAt: new Date(paidAt).toISOString(),
        reason: reason.trim(),
      }),
    })
      .then(() => {
        onRecorded();
        onClose();
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not record this payment.'))
      .finally(() => setSaving(false));
  }

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
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', color: oklch.textStrong }}>Record a payment</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: oklch.textMuted }}>{businessName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
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
              cursor: saving ? 'not-allowed' : 'pointer',
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
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'oklch(0.45 0.02 155)' }}>What they are charged</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: oklch.text }}>{inr(subscription.finalPriceMinor / 100)}</span>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>How they paid</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {METHODS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={saving}
                  onClick={() => setMethod(value)}
                  style={{
                    flex: '1 1 110px',
                    height: 40,
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    ...(method === value
                      ? { background: 'oklch(0.31 0.055 158)', color: 'white', border: '1px solid oklch(0.31 0.055 158)' }
                      : { background: 'white', color: 'oklch(0.45 0.02 155)', border: `1px solid ${oklch.borderStrong}` }),
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginTop: 16 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>Amount received (₹)</label>
              <TextInput
                type="number"
                min={0}
                step="0.01"
                disabled={saving}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ marginTop: 7, fontSize: 15, fontWeight: 700 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>When it arrived</label>
              <TextInput
                type="datetime-local"
                disabled={saving}
                max={localDateTimeValue(new Date())}
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                style={{ marginTop: 7, fontWeight: 600 }}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>Reference</label>
            <TextInput
              disabled={saving}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UTR, UPI reference, cheque number, or receipt number"
              style={{ marginTop: 7, fontWeight: 500 }}
            />
            {/* Not decoration: the reference is what makes this payment
                unique in the database, so recording the same transfer twice
                is refused rather than counted twice. Say so, or an admin
                who cannot find the UTR will type something arbitrary. */}
            <div style={{ marginTop: 6, fontSize: 12, color: oklch.textFaint, fontWeight: 600 }}>
              This is what ties the payment to the bank statement. The same reference cannot be recorded twice.
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>Reason</label>
            <TextInput
              disabled={saving}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Paid by NEFT, confirmed against the bank statement"
              style={{ marginTop: 7, fontWeight: 500 }}
            />
          </div>

          {future ? <Note tone="danger">That is in the future. A payment can only be recorded after it arrived.</Note> : null}
          {!future && amount !== '' && !amountValid ? <Note tone="danger">Enter an amount greater than zero, in rupees and paise.</Note> : null}
          {partial ? (
            <Note tone="muted">
              Less than the {inr(subscription.finalPriceMinor / 100)} charged. That is recorded as exactly what arrived — the rest stays owed.
            </Note>
          ) : null}
          {overpaid ? (
            <Note tone="muted">More than the {inr(subscription.finalPriceMinor / 100)} charged. Recorded as received; nothing is refunded here.</Note>
          ) : null}

          <div
            style={{
              marginTop: 18,
              borderRadius: 14,
              border: '1px solid oklch(0.9 0.02 150)',
              background: 'oklch(0.98 0.012 150)',
              padding: '14px 16px',
              fontSize: 12.5,
              lineHeight: 1.5,
              color: 'oklch(0.45 0.02 155)',
              fontWeight: 600,
            }}
          >
            No payment provider confirms this — you are asserting the money arrived. It is recorded against your name with the reason above, and
            an overdue subscription is brought back to normal immediately.
          </div>

          {error ? <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: oklch.danger }}>{error}</div> : null}
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '14px 24px 22px' }}>
          <SecondaryButton onClick={onClose} disabled={saving} style={{ flex: 1, height: 46 }}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={submit} disabled={!canSave} style={{ flex: 1, height: 46, justifyContent: 'center' }}>
            {saving ? 'Recording…' : 'Record payment'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Note({ tone, children }: { tone: 'danger' | 'muted'; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12,
        fontSize: 12.5,
        fontWeight: 600,
        color: tone === 'danger' ? 'oklch(0.5 0.15 25)' : oklch.textFaint,
      }}
    >
      {children}
    </div>
  );
}
