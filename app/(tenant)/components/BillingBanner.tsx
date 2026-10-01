import type { ReactNode } from 'react';
import { PayNowButton } from './PayNowButton';
import { AutopayHaltedLine } from './AutopayHaltedNotice';

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
  billing: { status: string; message: string | null; autopayHalted?: boolean } | null;
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
      {/*
       * Jira GRW-413 — when AutoPay has HALTED, this sentence REPLACES the status
       * one rather than being added under it.
       *
       * The status sentence ("this month is not paid yet, access continues for
       * now") is true and the less useful of the two: nothing Growza runs will
       * collect this money, because the provider recovers a halted mandate only
       * when the customer re-authorises it. The halted sentence says that and
       * names the two actions that work. In the owner's own language, and only
       * when there is somewhere to act and a role that may act (the API sets this
       * on the same gates as Pay now).
       *
       * Replacing rather than adding is also what keeps the banner to ONE ROW.
       * It was a second row, and the device matrix showed what that costs: at
       * 568x320 the shell's bottom nav is pushed off `/reports`. That viewport
       * fails with the plain banner too — it is a pre-existing shell defect,
       * measured and reported, not this card's — and a warning that grew by a
       * row would have made it worse for every route.
       *
       * One row, not one LINE, and the difference matters (Jira GRW-229 measured
       * it). The structure below guarantees the row: one `<span>`, one sentence,
       * a ternary between them, so a second row cannot appear. It guarantees
       * nothing about height, because the halted sentence is longer than the
       * status one it replaces and carries a link, so it WRAPS — 60px over two
       * lines at 1470x760 against 47px over one for the sentence it replaces,
       * and 87px over three at 402x874 against 67px over two. Whatever sits
       * under this banner loses that height. Do not read "one row" as "no taller
       * than before"; measure it.
       *
       * `billDue` is true by the fact this banner is rendering at all: it appears
       * only for a subscription the ladder has moved off ACTIVE, which is a bill
       * that has not been paid.
       */}
      <span style={{ minWidth: 0, flex: 1 }}>{billing.autopayHalted ? <AutopayHaltedLine billDue={true} /> : billing.message}</span>
      {/* GRW-145 — the one thing an owner reading this warning can actually do
          about it. Absent when online payment is off for them, in which case
          the message itself already tells them how to pay. */}
      {canPayOnline ? <PayNowButton restricted={restricted} /> : null}
    </div>
  );
}
