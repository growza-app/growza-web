import type { ReactNode } from 'react';

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
export function BillingBanner({ billing }: { billing: { status: string; message: string | null } | null }): ReactNode {
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
      <span style={{ minWidth: 0 }}>{billing.message}</span>
    </div>
  );
}
