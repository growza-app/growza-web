'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { PayNowButton } from './PayNowButton';

/**
 * Jira GRW-413 — "your automatic payment stopped: re-approve it, or pay this
 * bill now".
 *
 * The provider halts a UPI mandate once its debits keep failing, and a halted
 * one it will never debit again. Nothing on Growza's side can restart it —
 * dunning used to try, with a call the provider refused every time — so the only
 * two things that recover this account are the owner re-approving AutoPay in
 * their own UPI app, and the owner paying the open bill by link. A salon in this
 * state used to be reminded and then suspended without ever being told either.
 *
 * Two components, not one with a `place` switch: the Billing card carries the
 * buttons, the dashboard banner carries one sentence and a way to that card.
 * They shared a component briefly, and the banner then shipped an unreachable
 * `useState`, an error slot and a re-approval handler to every route in the app.
 */

/**
 * Which sentence: `billDue` false drops the half about paying a bill, because
 * there is no bill to pay — only a mandate to put back.
 */
const haltedKey = (billDue: boolean) => (billDue ? 'halted' : 'haltedNoBill');

/**
 * The Billing card's version: the sentence and both actions.
 *
 * Tapping Re-approve approves nothing. It asks Growza for the provider's
 * approval page and goes there; the permission exists only once the owner
 * approves it in their UPI app. Same boundary as Pay now and the renewal ask.
 */
export function AutopayHaltedNotice({ billDue, canPayOnline }: { billDue: boolean; canPayOnline: boolean }) {
  const t = useTranslations('autopayRenewal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reapprove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await api.startAutopay();
      // Same tab, as Pay now: a blocked popup is a button that did nothing.
      window.location.assign(started.approvalUrl);
    } catch (err) {
      // 409 means nothing is wrong — the mandate is live again, or there is
      // nothing to collect — so the page is stale rather than broken.
      setError(err instanceof ApiError && err.status !== 409 ? err.message : t('failed'));
      setBusy(false);
    }
  }

  return (
    <div className="ar-notice ar-missed" role="status" data-testid="autopay-halted">
      <p className="ar-notice-text">{t(haltedKey(billDue))}</p>
      {/* Jira GRW-402's rule, kept: no button that can only fail. With online
          payment unavailable the owner is still told what happened, and there is
          no empty action row under it. */}
      {canPayOnline ? (
        <div className="ar-notice-actions">
          <button type="button" className="bill-autopay-button" onClick={reapprove} disabled={busy}>
            {busy ? t('opening') : t('haltedApprove')}
          </button>
          {/* The two actions the sentence names, in the order it names them. */}
          {billDue ? <PayNowButton restricted={false} /> : null}
        </div>
      ) : null}
      {error ? (
        <p className="ar-notice-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The billing banner's version: the sentence, and a link to the card above.
 *
 * A plain block, not a second coloured box and not a second live region — the
 * banner is already `role="status"`, and a nested one is announced twice. Pay now
 * is already the button beside this in the banner, so the only action here is the
 * way to the screen where re-approval lives.
 */
export function AutopayHaltedLine({ billDue }: { billDue: boolean }) {
  const t = useTranslations('autopayRenewal');
  return (
    <span className="billing-banner-halted">
      {t(haltedKey(billDue))}{' '}
      <a className="ar-link" href="/settings/billing">
        {t('openBilling')}
      </a>
    </span>
  );
}
