'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '../lib/api';
import { formatDateOnly, formatMoneyMinor } from '../lib/format';
import { oklch } from '../tokens';

type Preview =
  | { subscription: false }
  | {
      subscription: true;
      currency: string;
      openBranchesBefore: number;
      openBranchesAfter: number;
      monthlyBeforeMinor: number;
      monthlyAfterMinor: number;
      differenceMinor: number;
      effectiveFrom: string;
      mandateReapprovalNeeded: boolean;
    };

/**
 * Jira GRW-240 — what adding or closing a branch does to the bill, shown inside
 * the dialog before support confirms. The figures come from the API's preview,
 * which uses the invoice generator's pricing; nothing is added up here.
 *
 * A preview that fails to load does not block the action (Error Handling): the
 * admin sees a warning and can still confirm.
 */
export function BranchBillPreview({ businessId, change, open }: { businessId: string; change: 'add' | 'close'; open: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setPreview(null);
    setFailed(false);
    adminFetch<Preview>(`/businesses/${businessId}/branches/preview?change=${change}`, { signal: controller.signal })
      .then(setPreview)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [businessId, change, open]);

  const box = { marginTop: 12, padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5, border: `1px solid ${oklch.borderStrong}` } as const;

  if (failed) return <div style={{ ...box, color: 'oklch(0.45 0.13 60)' }}>The new price could not be shown. You can still continue.</div>;
  if (!preview) return <div style={{ ...box, color: oklch.textFaint }}>Working out the new bill…</div>;
  if (!preview.subscription) return <div style={{ ...box, color: oklch.textMuted }}>No subscription — nothing is billed for branches.</div>;

  const same = preview.differenceMinor === 0;
  return (
    <div style={box} data-testid="branch-bill-preview">
      <div style={{ fontWeight: 700, color: oklch.textStrong }}>
        {same ? (
          <>The monthly bill stays {formatMoneyMinor(preview.monthlyBeforeMinor)} + GST.</>
        ) : (
          <>
            Now {formatMoneyMinor(preview.monthlyBeforeMinor)}/month → from {formatDateOnly(preview.effectiveFrom)} {formatMoneyMinor(preview.monthlyAfterMinor)}/month (
            {preview.differenceMinor > 0 ? '+' : '−'}
            {formatMoneyMinor(Math.abs(preview.differenceMinor))}) + GST
          </>
        )}
      </div>
      <div style={{ color: oklch.textMuted, marginTop: 4 }}>
        {preview.openBranchesBefore} → {preview.openBranchesAfter} open branches. Nothing is charged for this month.
        {preview.mandateReapprovalNeeded
          ? ' The customer will be asked to approve a new UPI AutoPay amount.'
          : same
            ? ''
            : ' The owner sees the new amount in their app until the bill is raised.'}
      </div>
    </div>
  );
}
