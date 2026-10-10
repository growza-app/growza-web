'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { AutopayRenewal } from '../lib/api-types';
import type { Lang } from '../lib/lang';

/**
 * Jira GRW-242 — "your bill goes up; approve the new automatic payment amount
 * before the billing date", on the owner's Home and on Billing.
 *
 * A UPI mandate is for the exact amount the owner approved, and it can never
 * be debited above it. When a branch is added the next bill outgrows it, and
 * only the owner can fix that, in their own UPI app. This is where they are
 * asked — in the app only, because nothing can send a WhatsApp or SMS yet
 * (GRW-165) — and the wording gets more urgent at 7, 3 and 1 days before.
 *
 * Tapping Approve does not approve anything. It asks Growza for the provider's
 * approval page and goes there; the new amount exists only once the owner
 * approves it in their UPI app, and the webhook is what tells Growza they did.
 *
 * A LOWER bill (`down`) is shown only on Billing, calmly, as an offer: the
 * provider cannot debit a UPI mandate for less than its own amount, so the
 * extra is taken off the next bill, and the owner may swap to the lower amount
 * if they want to. It is never asked for (BR-02) and never on Home.
 */
export function AutopayRenewalNotice({
  renewal,
  lang,
  place,
  canApprove,
}: {
  renewal: AutopayRenewal;
  lang: Lang;
  place: 'home' | 'billing';
  /**
   * Jira GRW-402's rule, kept: no button that can only fail. False when this
   * deployment cannot take money online (no usable payment keys, or online
   * payments switched off) — the owner is still told, and a page they already
   * opened can still be finished.
   */
  canApprove: boolean;
}) {
  const t = useTranslations('autopayRenewal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (renewal.direction === 'down' && place === 'home') return null;

  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const money = (minor: number) => formatMoney(minor, renewal.currency, locale);
  const [y, m, d] = renewal.dueDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const args = { amount: money(renewal.toAmountMinor), old: money(renewal.fromAmountMinor), date, days: Math.max(renewal.daysLeft, 0) };

  async function approve() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const started = await api.startAutopay();
      // Same tab, as Pay now: a blocked popup is a button that did nothing.
      window.location.assign(started.approvalUrl);
    } catch (err) {
      setError(err instanceof ApiError && err.status !== 409 ? err.message : t('failed'));
      setBusy(false);
    }
  }

  const down = renewal.direction === 'down';
  const tone = down ? 'ar-calm' : renewal.missedLastBill ? 'ar-missed' : `ar-${renewal.stage}`;
  const message = down
    ? t('lower', args)
    : renewal.missedLastBill
      ? // On Billing, Pay now is at the top of the page this is on (review of PR #186).
        place === 'billing'
        ? t('missedHere', args)
        : t('missed', args)
      : renewal.stage === 'last'
        ? t('last', args)
        : renewal.stage === 'soon'
          ? t('soon', args)
          : t('ask', args);

  return (
    <div className={`ar-notice ${tone}`} role={down ? 'note' : 'status'} data-testid="autopay-renewal">
      <p className="ar-notice-text">
        {message}
        {renewal.approvalUrl ? <span className="ar-notice-hint">{t('waiting')}</span> : null}
      </p>
      <div className="ar-notice-actions">
        {renewal.approvalUrl ? (
          // The page from the approval they started, not a second mandate.
          <a className="bill-autopay-button" href={renewal.approvalUrl}>
            {t('finish')}
          </a>
        ) : canApprove ? (
          <button type="button" className="bill-autopay-button" onClick={approve} disabled={busy}>
            {busy ? t('opening') : down ? t('lowerAction', args) : t('approve', args)}
          </button>
        ) : null}
        {place === 'home' && renewal.missedLastBill ? (
          <a className="ar-link" href="/settings/billing">
            {t('openBilling')}
          </a>
        ) : null}
      </div>
      {error ? (
        <p className="ar-notice-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
