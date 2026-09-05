import type { ReactNode } from 'react';
import { PayNowButton } from './PayNowButton';

/**
 * GRW-122 — the owner's own billing warning, shown while a payment is in
 * trouble.
 *
 * The words come from the API, which reads them from billing's own
 * `STATE_ACCESS` table — the same source the notification GRW-122 sends will
 * use. Two hand-written versions of one warning is how a screen and a
 * message end up disagreeing, and this repo has already paid for that once
 * (commit `895e9ac`, "Make the download say what the screen says").
 *
 * Renders nothing at all when there is nothing to say. That covers both the
 * healthy case and the case where the state could not be resolved: a
 * dashboard that cannot tell should claim nothing, rather than reassure
 * falsely or warn falsely.
 */
export function BillingBanner({
  billing,
  canPayOnline,
}: {
  billing: { status: string; message: string | null } | null;
  /**
   * GRW-145/163 — whether to offer "Pay now" at all.
   *
   * False for a salon on the offline path, which is every salon until somebody
   * switches `payments.online` on for them. A button that 404s is worse than no
   * button: it tells an owner in trouble that the fix is broken.
   */
  canPayOnline?: boolean;
}): ReactNode {
  if (!billing?.message) return null;

  // Restriction has already happened for these; the rest are warnings about
  // something that still can be prevented, which is the whole point of
  // telling the owner at all.
  const restricted = billing.status === 'SUSPENDED' || billing.status === 'PAUSED';

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        // Wraps at 320px rather than squeezing the button off the edge — the
        // banner is a full sentence at that width and the action must survive it.
        flexWrap: 'wrap',
        gap: 10,
        margin: '0 0 14px',
        padding: '12px 14px',
        borderRadius: 12,
        // Its own container, and text that wraps rather than truncates: at
        // 320px this is a full sentence and it must stay readable.
        lineHeight: 1.5,
        fontSize: 13.5,
        fontWeight: 600,
        border: restricted ? '1px solid oklch(0.82 0.11 25)' : '1px solid oklch(0.85 0.09 80)',
        background: restricted ? 'oklch(0.96 0.04 25)' : 'oklch(0.97 0.05 85)',
        color: restricted ? 'oklch(0.42 0.15 25)' : 'oklch(0.4 0.11 70)',
      }}
    >
      <span aria-hidden style={{ flex: 'none', fontSize: 15, lineHeight: 1.4 }}>
        {restricted ? '⚠' : 'ⓘ'}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>{billing.message}</span>
      {/* GRW-145 — the one thing an owner reading this warning can actually do
          about it. Absent when online payment is off for them, in which case
          the message itself already tells them how to pay. */}
      {canPayOnline ? <PayNowButton restricted={restricted} /> : null}
    </div>
  );
}
