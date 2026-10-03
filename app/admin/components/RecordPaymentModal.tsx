'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Icon } from '../icons';
import { inr, oklch } from '../tokens';
import { PrimaryButton, SecondaryButton, TextInput } from './primitives';
import { useDialog } from '../../shared/a11y/useDialog';

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

/** Postgres `integer`, which is what `payment.amount_minor` is. */
const INT4_MAX = 2_147_483_647;

/** A hung request must not leave an admin with a modal they cannot close (QA pass). */
const REQUEST_TIMEOUT_MS = 30_000;

export interface RecordPaymentSubscription {
  id: string;
  finalPriceMinor: number;
}

/** The 201 body: the payment row, plus what recording it actually did. */
interface RecordedPayment {
  recovered: boolean;
  detail: string;
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

/**
 * What the admin typed, checked as TYPED rather than as a number.
 *
 * QA pass — the old guard ended in `Number.isInteger(Math.round(rupees * 100))`,
 * which `Math.round` makes true for every finite input, so it never rejected
 * anything. `79.995` was silently recorded as ₹80.00 and `1.005` as ₹1.00 —
 * two different roundings of the same shape — on the one screen whose whole
 * premise is that the recorded figure is what the admin asserted. Rupees have
 * two decimal places; anything else is a typo, and is refused rather than
 * rounded on the admin's behalf.
 */
function parseRupees(raw: string): { ok: true; minor: number } | { ok: false; why: string } {
  const text = raw.trim();
  if (text === '') return { ok: false, why: '' };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { ok: false, why: 'Enter an amount in rupees and paise — digits, and at most two decimal places.' };
  }
  const minor = Math.round(Number(text) * 100);
  if (minor <= 0) return { ok: false, why: 'Enter an amount greater than zero.' };
  if (minor > INT4_MAX) return { ok: false, why: `That is larger than the biggest amount that can be recorded (${inr(INT4_MAX / 100)}).` };
  return { ok: true, minor };
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
  onRecorded: (result: RecordedPayment) => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * Jira GRW-475 — an amount far beyond what is owed comes back 409 `amount_unusually_large`. The admin sees why
   * and records it anyway with one more tap, or corrects a slipped zero; nothing was written by the first try.
   */
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const ids = useId();

  const open = businessName !== null && subscription !== null;
  const openedFor = useRef<string | null>(null);

  /**
   * Seed the form ONCE per opening, on the transition into open.
   *
   * QA pass, HIGH — this used to be an effect keyed on
   * `[businessName, subscription?.id, subscription?.finalPriceMinor]`, and
   * both of the extra deps change while the modal is open. The subscription
   * page resolves the business NAME through a second request, so the modal
   * routinely opened as "This business" and re-rendered with the real name a
   * moment later — wiping a half-typed reference, resetting the method to
   * bank transfer and the date to now, silently, with only the subtitle
   * visibly changing. On a record that cannot afterwards be amended.
   *
   * A ref rather than a dep list because the question is "did this open",
   * which no combination of prop values can answer on its own.
   */
  useEffect(() => {
    if (!open) {
      openedFor.current = null;
      return;
    }
    if (openedFor.current === subscription.id) return;
    openedFor.current = subscription.id;
    setAmount(String(subscription.finalPriceMinor / 100));
    setMethod('bank_transfer');
    setReference('');
    setPaidAt(localDateTimeValue(new Date()));
    setReason('');
    setError(null);
  }, [open, subscription]);

  // Escape closes it, focus stays inside, and goes back to the button that opened it (Jira GRW-342). Not while a
  // request is in flight: the POST would still land, and closing would tell the admin nothing happened.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose: saving ? undefined : onClose, active: open });

  if (!open) return null;

  const parsedAmount = parseRupees(amount);
  const owed = subscription.finalPriceMinor;
  const partial = parsedAmount.ok && parsedAmount.minor < owed;
  const overpaid = parsedAmount.ok && parsedAmount.minor > owed;
  const paidAtDate = paidAt === '' ? null : new Date(paidAt);
  const paidAtValid = paidAtDate !== null && !Number.isNaN(paidAtDate.getTime());
  const future = paidAtValid && paidAtDate.getTime() > Date.now();

  // Said out loud rather than left as a greyed button with no explanation.
  const blocker = !parsedAmount.ok
    ? (parsedAmount.why ?? '') || 'Enter the amount received.'
    : !paidAtValid
      ? 'Enter when the payment arrived.'
      : future
        ? 'That is in the future. A payment can only be recorded after it arrived.'
        : reference.trim() === ''
          ? 'Enter the reference from the bank statement.'
          : reason.trim() === ''
            ? 'Enter a reason — it is recorded against your name.'
            : null;
  const canSave = blocker === null && !saving;

  function submit(confirmLargeAmount = false) {
    if (!parsedAmount.ok || !paidAtValid) return;
    setSaving(true);
    setError(null);
    // A fetch with no timeout that never settles leaves `saving` true
    // forever, and every way out of this modal is gated on `saving`.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    adminFetch<RecordedPayment>(`/subscriptions/${subscription!.id}/payments`, {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        amountMinor: parsedAmount.minor,
        method,
        reference: reference.trim(),
        paidAt: paidAtDate!.toISOString(),
        reason: reason.trim(),
        ...(confirmLargeAmount ? { confirmLargeAmount: true } : {}),
      }),
    })
      .then((result) => {
        onRecorded(result);
        onClose();
      })
      .catch((err) => {
        setNeedsConfirm(err instanceof AdminApiError && err.code === 'amount_unusually_large');
        setError(
          err instanceof AdminApiError
            ? err.message
            : controller.signal.aborted
              ? 'That took too long to answer. Check the Payments screen before trying again — it may have been recorded.'
              : 'Could not record this payment.',
        );
      })
      .finally(() => {
        clearTimeout(timer);
        setSaving(false);
      });
  }

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
      onClick={saving ? undefined : onClose}
    >
      <div
        role="dialog"
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
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
            <h3 id={`${ids}-title`} style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', color: oklch.textStrong }}>
              Record a payment
            </h3>
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
            <span style={{ fontSize: 16, fontWeight: 800, color: oklch.text }}>{inr(owed / 100)}</span>
          </div>

          <div style={{ marginTop: 16 }} role="group" aria-labelledby={`${ids}-method`}>
            <span id={`${ids}-method`} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>
              How they paid
            </span>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {METHODS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={saving}
                  // Colour alone cannot say which is selected (WCAG 1.4.1).
                  aria-pressed={method === value}
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14, marginTop: 16 }}>
            <div>
              <label htmlFor={`${ids}-amount`} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>
                Amount received (₹)
              </label>
              <TextInput
                id={`${ids}-amount`}
                autoFocus
                inputMode="decimal"
                disabled={saving}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ marginTop: 7, fontSize: 15, fontWeight: 700 }}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-paidat`} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>
                When it arrived
              </label>
              <TextInput
                id={`${ids}-paidat`}
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
            <label htmlFor={`${ids}-reference`} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>
              Reference
            </label>
            <TextInput
              id={`${ids}-reference`}
              disabled={saving}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UTR, UPI reference, cheque number, or receipt number"
              style={{ marginTop: 7, fontWeight: 500 }}
            />
            {/* Not decoration: the reference is what makes this payment
                unique against this subscription, so recording the same
                transfer twice is refused rather than counted twice. Say so,
                or an admin who cannot find the UTR will type something
                arbitrary. */}
            <div style={{ marginTop: 6, fontSize: 12, color: oklch.textFaint, fontWeight: 600 }}>
              This is what ties the payment to the bank statement. The same reference cannot be recorded twice for this business.
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor={`${ids}-reason`} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)' }}>
              Reason
            </label>
            <TextInput
              id={`${ids}-reason`}
              disabled={saving}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Paid by NEFT, confirmed against the bank statement"
              style={{ marginTop: 7, fontWeight: 500 }}
            />
          </div>

          {blocker && amount !== '' ? <Note tone="danger">{blocker}</Note> : null}
          {partial ? (
            <Note tone="muted">
              Less than the {inr(owed / 100)} charged. It is recorded as exactly what arrived — the rest stays owed, and the subscription is
              not restored until the balance is paid.
            </Note>
          ) : null}
          {overpaid ? <Note tone="muted">More than the {inr(owed / 100)} charged. Recorded as received; nothing is refunded here.</Note> : null}

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
            No payment provider confirms this — you are asserting the money arrived. It is recorded against your name with the reason above.
          </div>

          {error ? <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: oklch.danger }}>{error}</div> : null}
          {needsConfirm ? (
            <div style={{ marginTop: 8 }}>
              <SecondaryButton onClick={() => submit(true)} disabled={saving}>
                The amount is right — record it
              </SecondaryButton>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '14px 24px 22px' }}>
          <SecondaryButton onClick={onClose} disabled={saving} style={{ flex: 1, height: 46 }}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            onClick={() => submit()}
            disabled={!canSave}
            title={blocker ?? undefined}
            style={{ flex: 1, height: 46, justifyContent: 'center' }}
          >
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
