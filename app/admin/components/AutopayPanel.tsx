'use client';

import { useCallback, useEffect, useState } from 'react';
import { isMandateHalted } from '@growza-app/shared';
import { adminFetch, AdminApiError } from '../lib/api';
import { formatDateOnly, formatMoneyMinor, formatTimestampDate } from '../lib/format';
import { Card, SecondaryButton, SectionTitle, StatusPill } from './primitives';
import { oklch } from '../tokens';

/**
 * Jira GRW-242 — the business's UPI AutoPay, on the admin Billing tab.
 *
 * Answers the call support gets when a salon's bill went up: "is their AutoPay
 * for the right amount, were they asked, when, and what happened?" — as
 * "Re-approval pending: ₹943 → ₹1,296, due 14 Oct", with the reminder history
 * under it. Read-only on purpose: only the owner can approve a mandate, in
 * their own UPI app; support can explain, never approve.
 */

interface Mandate {
  status: 'pending' | 'active' | 'paused' | 'cancelled' | 'failed';
  amountMinor: number | null;
  approvedAt: string | null;
  /** Whether the owner opened an approval page. The page itself is theirs and never sent here. */
  approvalStarted: boolean;
}

interface Current {
  direction: 'up' | 'down';
  fromAmountMinor: number;
  toAmountMinor: number;
  dueDate: string;
  daysLeft: number;
  missedLastBill: boolean;
  approvalStarted: boolean;
}

interface HistoryEntry {
  kind: string;
  at: string;
  dueDate?: string;
  fromMinor?: number;
  toMinor?: number;
  daysBefore?: number;
  paidMinor?: number;
  shortfallMinor?: number;
  reason?: string;
}

interface Renewal {
  id: string;
  direction: 'up' | 'down';
  status: 'pending' | 'approved' | 'withdrawn';
  fromAmountMinor: number;
  toAmountMinor: number;
  dueDate: string;
  createdAt: string;
  history: HistoryEntry[];
}

interface CancelNeedingSupport {
  externalSubscriptionId: string;
  why: 'replaced' | 'stale' | 'ended' | 'refused';
  requestedAt: string;
  attempts: number;
  lastError: string | null;
}

interface AutopayView {
  mandate: Mandate | null;
  current: Current | null;
  renewals: Renewal[];
  cancelsNeedingSupport: CancelNeedingSupport[];
}

const CANCEL_WHY: Record<CancelNeedingSupport['why'], string> = {
  replaced: 'the old AutoPay a new amount replaced',
  stale: 'an approval page that is no longer wanted',
  ended: 'the AutoPay of a plan that has ended',
  refused: 'an AutoPay approved after its plan had ended',
};

/**
 * Jira GRW-413 — `failed` said "Last debit failed", which reads as something in
 * progress. It is not: the provider has HALTED the mandate and will never debit
 * it again, nothing retries it, and the owner is being asked on their Billing
 * screen to re-approve AutoPay or pay the bill by link. Support fielding "why am
 * I about to be suspended?" needs to see that, not a past-tense decline.
 */
const MANDATE_WORDS: Record<Mandate['status'], string> = {
  active: 'On',
  pending: 'Waiting for the owner to approve',
  paused: 'Paused by the owner',
  cancelled: 'Stopped by the owner',
  failed: 'AutoPay halted — owner asked to re-approve',
};

function describe(entry: HistoryEntry): string {
  const money = (m?: number) => (m === undefined ? '—' : formatMoneyMinor(m));
  switch (entry.kind) {
    case 'requested':
      return `Owner asked to approve ${money(entry.fromMinor)} → ${money(entry.toMinor)}${entry.dueDate ? `, due ${formatDateOnly(entry.dueDate)}` : ''}`;
    case 'amount_changed':
      return `Amount changed: ${money(entry.fromMinor)} → ${money(entry.toMinor)}`;
    case 'reminded':
      return `Reminded in the app — ${entry.daysBefore} day${entry.daysBefore === 1 ? '' : 's'} before the billing date`;
    case 'approval_started':
      return `Owner opened the approval page for ${money(entry.toMinor)}`;
    case 'approval_dropped':
      return `Approval page dropped${entry.reason ? ` — ${entry.reason}` : ''}`;
    case 'approved':
      return `Approved: ${money(entry.fromMinor)} → ${money(entry.toMinor)}`;
    case 'missed':
      return `Not approved by ${entry.dueDate ? formatDateOnly(entry.dueDate) : 'the billing date'} — the old amount was debited`;
    case 'shortfall':
      return `Part-paid: ${money(entry.paidMinor)} debited, ${money(entry.shortfallMinor)} left to pay by link`;
    case 'withdrawn':
      return `No longer needed${entry.reason ? ` — ${entry.reason}` : ''}`;
    case 'old_cancelled':
      return `Old AutoPay cancelled${entry.reason ? ` — ${entry.reason}` : ''}`;
    default:
      return entry.kind;
  }
}

export function AutopayPanel({ businessId }: { businessId: string }) {
  const [view, setView] = useState<AutopayView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      adminFetch<AutopayView>(`/businesses/${encodeURIComponent(businessId)}/autopay`, { signal })
        .then((v) => {
          setView(v);
          setError(null);
        })
        .catch((err) => {
          if (signal?.aborted) return;
          setError(err instanceof AdminApiError ? err.message : 'Could not load automatic payment.');
        }),
    [businessId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (error) {
    return (
      <Card>
        <SectionTitle title="Automatic payment (UPI AutoPay)" right={<SecondaryButton onClick={() => void load()}>Retry</SecondaryButton>} />
        <div style={{ fontSize: 13, color: oklch.danger, fontWeight: 600 }}>{error}</div>
      </Card>
    );
  }
  if (!view) return null;

  const { mandate, current } = view;
  const latest = view.renewals[0] ?? null;
  const callout = current?.direction === 'up';

  return (
    <Card>
      <SectionTitle title="Automatic payment (UPI AutoPay)" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }} data-testid="admin-autopay">
        {view.cancelsNeedingSupport.map((c) => (
          <div
            key={c.externalSubscriptionId}
            role="alert"
            style={{ padding: '10px 12px', borderRadius: 10, fontWeight: 700, lineHeight: 1.5, background: oklch.dangerBg, color: oklch.dangerStrong }}
          >
            AutoPay cancel failed — cancel it in the payment provider&apos;s dashboard:{' '}
            <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>{c.externalSubscriptionId}</code>
            <div style={{ fontWeight: 600, fontSize: 12.5 }}>
              It is {CANCEL_WHY[c.why]}. Asked since {formatTimestampDate(c.requestedAt)}, {c.attempts} tries
              {c.lastError ? ` — last answer: ${c.lastError}` : ''}. Until it is cancelled it could still take a payment.
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: oklch.textStrong }}>
            {mandate ? MANDATE_WORDS[mandate.status] : 'Never set up — the owner pays by link or transfer'}
            {mandate?.amountMinor != null && mandate.status !== 'cancelled' ? ` — ${formatMoneyMinor(mandate.amountMinor)} a month` : ''}
          </span>
          {mandate?.approvedAt ? <span style={{ color: oklch.textFaint }}>approved {formatTimestampDate(mandate.approvedAt)}</span> : null}
        </div>

        {/* Jira GRW-413 — what to tell them when they ring. Nothing is retrying
            this, and saying so is the point: support used to read "last debit
            failed" and reassure a salon that Growza would try again. */}
        {isMandateHalted(mandate?.status) ? (
          <div
            role="status"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              fontWeight: 700,
              lineHeight: 1.5,
              background: oklch.warnBg,
              border: `1px solid ${oklch.border}`,
              color: oklch.textStrong,
            }}
            data-testid="admin-autopay-halted"
          >
            The payment provider has stopped this AutoPay after its debits failed, and nothing retries it. Their Billing screen asks them to
            re-approve AutoPay, or to pay the open bill with Pay now — only the owner can do either, in their own UPI app. Until one of them
            happens the billing clock keeps running towards suspension.
          </div>
        ) : null}

        {current ? (
          <div
            role="status"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              fontWeight: 700,
              lineHeight: 1.5,
              background: callout ? oklch.warnBg : oklch.surfaceSubtle,
              border: `1px solid ${oklch.border}`,
              color: oklch.textStrong,
            }}
          >
            {callout ? (
              <>
                Re-approval pending: {formatMoneyMinor(current.fromAmountMinor)} → {formatMoneyMinor(current.toAmountMinor)}, due {formatDateOnly(current.dueDate)}
                {current.daysLeft >= 0 ? ` (${current.daysLeft} day${current.daysLeft === 1 ? '' : 's'} left)` : ''}.
                {current.approvalStarted ? ' The owner has opened the approval page but not finished.' : ''}
                {current.missedLastBill ? ' The last billing date was missed — part of that bill is still to pay by link.' : ''}
              </>
            ) : (
              <>
                AutoPay takes {formatMoneyMinor(current.fromAmountMinor)} but the bill is {formatMoneyMinor(current.toAmountMinor)}: the provider cannot debit a UPI
                mandate for less, so the extra is taken off the next bill. The owner can lower it from Billing; nobody is asked to.
              </>
            )}
          </div>
        ) : null}

        {latest ? (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: oklch.textStrong }}>
                Latest change: {formatMoneyMinor(latest.fromAmountMinor)} → {formatMoneyMinor(latest.toAmountMinor)}
              </span>
              <StatusPill status={latest.status} />
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, color: oklch.textMuted }}>
              {latest.history.map((h, i) => (
                <li key={`${h.kind}-${h.at}-${i}`}>
                  <span style={{ color: oklch.textStrong }}>{describe(h)}</span>
                  <span style={{ color: oklch.textFaint }}> · {formatTimestampDate(h.at)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
