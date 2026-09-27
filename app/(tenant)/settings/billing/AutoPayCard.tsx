'use client';

import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { OwnerBilling } from '../../lib/api-types';
import { billingCopy } from '../../lib/billing-copy';
import type { Lang } from '../../lib/lang';
import { AutopayRenewalNotice } from '../../components/AutopayRenewalNotice';
import { AutopayHaltedNotice } from '../../components/AutopayHaltedNotice';
// Jira GRW-413 — one predicate for "the provider stopped it", shared with the API and the admin portal.
import { isMandateHalted } from '@growza-app/shared';

/**
 * Jira GRW-241 — automatic payment, on the Billing screen.
 *
 * Tapping the button does not approve anything and must never read as though
 * it did. It asks Growza for the provider's approval page and sends the owner
 * there; the permission exists only once they approve it in their own UPI app,
 * and the webhook that already exists is what tells Growza they did.
 *
 * No UPI id, no bank, no instrument of any kind is rendered or collected here.
 * The hosted page is the boundary and it is the provider's, exactly as it is
 * for Pay now.
 */
export function AutoPayCard({
  autopay,
  paidBy,
  currency,
  lang,
  renewal = null,
  canPayOnline = false,
  billDue = false,
}: {
  autopay: NonNullable<OwnerBilling['subscription']>['autopay'];
  paidBy: NonNullable<OwnerBilling['subscription']>['paidBy'];
  currency: string;
  lang: Lang;
  /** Jira GRW-242 — the next bill is not what AutoPay takes: approve the new amount (or, lower, change it). */
  renewal?: NonNullable<OwnerBilling['subscription']>['autopayRenewal'];
  /** Jira GRW-402 — whether an approval page can be made at all. */
  canPayOnline?: boolean;
  /** Jira GRW-413 — whether a bill is open, so a halted AutoPay is asked to "pay this bill" only when there is one. */
  billDue?: boolean;
}) {
  const t = billingCopy(lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `offline` is the account that cannot pay online at all. There is no offer
  // to make, so the card is not rendered rather than being rendered disabled —
  // a control an owner can never use is worse than no control (AC-05).
  if (paidBy === 'offline') return null;

  const money = (minor: number) =>
    new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
    }).format(minor / 100);

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await api.startAutopay();
      // Same tab, not a popup — the same reasoning as Pay now: a blocked popup
      // is a button that did nothing, and the owner cannot diagnose that.
      window.location.assign(started.approvalUrl);
    } catch (err) {
      // 409 means nothing is wrong — they already have one, or there is
      // nothing to collect — so the page is stale rather than broken.
      const message =
        err instanceof ApiError && err.status === 409
          ? t.loadError
          : err instanceof ApiError
            ? err.message
            : t.autopayError;
      setError(message);
      setBusy(false);
    }
  }

  const status = autopay?.status ?? null;

  return (
    <section className="card bill-card" aria-labelledby="bill-autopay">
      <h3 id="bill-autopay" className="bill-card-title">
        {t.autopay}
      </h3>

      {status === 'active' ? (
        <>
          <p className="bill-autopay-on">
            <strong>{t.autopayOn(autopay?.amountMinor != null ? money(autopay.amountMinor) : '—')}</strong>
          </p>
          {autopay?.approvedAt ? <p className="field-hint">{t.autopayOnSince(day(autopay.approvedAt))}</p> : null}
          {/* Jira GRW-242 — under the amount it would replace. */}
          {renewal ? <AutopayRenewalNotice renewal={renewal} lang={lang} place="billing" canApprove={canPayOnline} /> : null}
        </>
      ) : status === 'pending' ? (
        <>
          <p className="field-hint">{t.autopayWaiting}</p>
          {/* The page from the attempt they left, not a second mandate. */}
          {autopay?.approvalUrl ? (
            <a className="bill-autopay-button" href={autopay.approvalUrl}>
              {t.autopayFinish}
            </a>
          ) : null}
        </>
      ) : isMandateHalted(status) ? (
        /*
         * Jira GRW-413 — halted, which is its own case and not "AutoPay is off".
         *
         * It used to render the generic off-card: one sentence saying the last
         * payment did not go through, and one button to turn AutoPay back on. So
         * the owner of a halted mandate was told to pay a bill with no way to pay
         * it from here, while dunning walked them towards suspension asking the
         * provider for a retry it always refused. Both actions, together, with
         * the sentence that names them.
         */
        <AutopayHaltedNotice billDue={billDue} canPayOnline={canPayOnline} />
      ) : (
        <>
          <p className="field-hint">
            {status === 'cancelled' ? t.autopayStopped : status === 'paused' ? t.autopayPaused : t.autopayOffExplain}
          </p>
          <button type="button" className="bill-autopay-button" onClick={start} disabled={busy}>
            {busy ? t.autopayOpening : status ? t.autopayAgain : t.autopaySetUp}
          </button>
        </>
      )}

      {error ? (
        <p className="billing-banner-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
