'use client';

import { useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { oklch } from '../tokens';
import { ConfirmDialog } from './ConfirmDialog';
import { Card, SectionTitle, Toggle } from './primitives';
import { useToast } from './Toast';

/**
 * Jira GRW-556 (follow-up) — online payment, on the business's own page.
 *
 * It used to be a flag on the Feature flags screen that wanted this business's raw UUID pasted in, with nothing to say
 * that switching it on does nothing until the SERVER also has Razorpay's secret and real keys. An admin enabling
 * payments for a business is one of the most ordinary things they do; it belongs where they already are, in plain
 * words, with the one thing that can make it silently do nothing said out loud.
 *
 * It is still the per-business override of the `payments.online` flag underneath (same endpoint, same audit row, same
 * permission) — so the Feature flags screen keeps working and the two cannot disagree.
 */
export interface BusinessPayments {
  /** The flag as the owner's side resolves it: kill switch, this business's override, plan targeting, then the default. */
  online: boolean;
  /** This business's OWN answer, or null when it follows the default. */
  override: boolean | null;
  /** Whether this server has the webhook secret AND usable API keys — without them Pay now is never offered. */
  serverCanCollect: boolean;
}

export function PaymentsCard({
  businessId,
  businessName,
  payments,
  canManage,
  onChanged,
}: {
  businessId: string;
  businessName: string;
  payments: BusinessPayments;
  /** `admin.feature_flag.manage` — the permission the underlying override needs. */
  canManage: boolean;
  onChanged: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = !payments.online;
  const toast = useToast();

  const put = (enabled: boolean, reason: string) =>
    adminFetch(`/feature-flags/payments.online/overrides/${encodeURIComponent(businessId)}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled, reason }),
    });

  function change(reason: string) {
    const previousOverride = payments.override;
    setBusy(true);
    setError(null);
    put(next, reason)
      .then(() => {
        setAsking(false);
        onChanged();
        // Jira GRW-704 — say it worked, and offer the way back. Undo is its own audited change, its reason says so.
        toast.show({
          message: `Online payments ${next ? 'on' : 'off'} for ${businessName}`,
          undo: async () => {
            // Back to exactly where it was: a business that followed the default goes back to the default, rather
            // than being left with a setting of its own that happens to match it. `ifCurrent: next` — only if the
            // switch is still as this admin left it; if someone changed it since, the API refuses (409) and their
            // setting stays (QA, 11 Nov 2026: an old Undo erased another admin's later change).
            try {
              if (previousOverride === null) {
                await adminFetch(`/feature-flags/payments.online/overrides/${encodeURIComponent(businessId)}`, {
                  method: 'DELETE',
                  body: JSON.stringify({ ifCurrent: next, reason: `Undo: ${reason}` }),
                });
              } else {
                await adminFetch(`/feature-flags/payments.online/overrides/${encodeURIComponent(businessId)}`, {
                  method: 'PUT',
                  body: JSON.stringify({ enabled: previousOverride, ifCurrent: next, reason: `Undo: ${reason}` }),
                });
              }
            } finally {
              // Refused or not, show the switch as it now is.
              onChanged();
            }
          },
        });
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not change this.'))
      .finally(() => setBusy(false));
  }

  const stuck = payments.online && !payments.serverCanCollect;

  return (
    <Card>
      <SectionTitle title="Online payments" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 10 }}>
        <div style={{ fontSize: '0.84375rem', lineHeight: 1.5, color: oklch.textStrong }}>
          <strong>{payments.online ? 'On' : 'Off'}</strong>
          <span style={{ color: oklch.textMuted }}>
            {payments.online
              ? ' — the owner sees a Pay now button on their bill.'
              : ' — the owner is told to pay by UPI, and you record the payment under Billing.'}
          </span>
          <div style={{ fontSize: '0.78125rem', color: oklch.textFaint, marginTop: 2 }}>
            {payments.override === null ? 'Same as every business (the default).' : 'Set for this business only.'}
          </div>
        </div>
        <Toggle
          on={payments.online}
          onClick={() => {
            setError(null);
            setAsking(true);
          }}
          disabled={!canManage}
          label={`Online payments for ${businessName}`}
        />
      </div>

      {stuck ? (
        <div
          role="status"
          style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, fontSize: '0.8125rem', lineHeight: 1.5, background: oklch.dangerBg, color: oklch.textStrong }}
        >
          <strong>Switched on, but it will not work yet.</strong> Growza&apos;s payment account is not connected on the server
          (the Razorpay secret and keys). Until it is, this business still sees no Pay now button.
        </div>
      ) : null}
      {!canManage ? (
        <div style={{ marginTop: 10, fontSize: '0.78125rem', color: oklch.textFaint }}>You do not have permission to change this.</div>
      ) : null}

      <ConfirmDialog
        open={asking}
        title={next ? `Switch on online payments for ${businessName}?` : `Switch off online payments for ${businessName}?`}
        description={
          next
            ? 'The owner will be able to pay their bill online with a Pay now button, and can set up automatic payment.'
            : 'The owner will no longer see Pay now or automatic payment. They are told to pay by UPI, and you record it. Any automatic payment they already set up keeps working.'
        }
        confirmLabel={next ? 'Switch on' : 'Switch off'}
        reasonRequired
        reasonPlaceholder="Why? For example: pilot salon, Razorpay is live."
        loading={busy}
        error={error}
        onConfirm={change}
        onCancel={() => setAsking(false)}
      />
    </Card>
  );
}
