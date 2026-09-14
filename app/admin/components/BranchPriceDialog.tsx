'use client';

import { useEffect, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatMoneyMinor } from '../lib/format';
import { oklch } from '../tokens';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Jira GRW-161 — this customer's own price per extra branch, or the plan's.
 *
 * Through ConfirmDialog, so it asks for the reason every audited price change
 * asks for. It applies from the next bill; the panel re-reads the subscription
 * afterwards so the "next bill" figures show it at once.
 */
export function BranchPriceDialog({
  open,
  subscriptionId,
  planAddonMinor,
  branchesIncluded,
  currentMinor,
  onClose,
  onSaved,
}: {
  open: boolean;
  subscriptionId: string;
  planAddonMinor: number;
  branchesIncluded: number;
  currentMinor: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [input, setInput] = useState('');
  const [usePlan, setUsePlan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh every time it opens, from what is on the subscription now.
  useEffect(() => {
    if (!open) return;
    setInput(String(currentMinor / 100));
    setUsePlan(false);
    setError(null);
  }, [open, currentMinor]);

  return (
    <ConfirmDialog
      open={open}
      title="Price per extra branch"
      description={`The plan charges ${formatMoneyMinor(planAddonMinor)} a month for each branch beyond ${branchesIncluded}. Set a different price for this customer, or go back to the plan's. It applies from the next bill.`}
      confirmLabel="Save branch price"
      reasonRequired
      reasonPlaceholder="Why does this customer pay a different branch price?"
      loading={saving}
      error={error}
      onCancel={onClose}
      onConfirm={(reason) => {
        const amount = Number(input);
        if (!usePlan && (input.trim() === '' || Number.isNaN(amount) || amount < 0)) {
          setError('Enter a price of ₹0 or more.');
          return;
        }
        setSaving(true);
        setError(null);
        adminFetch(`/subscriptions/${subscriptionId}/branch-price`, {
          method: 'PUT',
          body: JSON.stringify({ reason, amountMinor: usePlan ? null : Math.round(amount * 100) }),
        })
          .then(onSaved)
          .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not save the branch price.'))
          .finally(() => setSaving(false));
      }}
    >
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
        <input type="checkbox" checked={usePlan} onChange={(e) => setUsePlan(e.target.checked)} />
        Use the plan&apos;s price
      </label>
      {!usePlan ? (
        <input
          aria-label="Price per extra branch (₹)"
          type="number"
          min={0}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ width: '100%', padding: '9px 11px', borderRadius: 10, border: `1px solid ${oklch.borderStrong}`, fontSize: 14 }}
        />
      ) : null}
    </ConfirmDialog>
  );
}
