'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError } from '../lib/api';

/**
 * GRW-145 — "Pay now", in the billing banner.
 *
 * Opens a Razorpay-hosted page. No card field is ever rendered by this
 * application and no payment detail ever reaches it (BR-03): the hosted page is
 * the boundary, and it is Razorpay's.
 *
 * Clicking this does not pay anything and does not record anything. It asks for
 * a link; the owner pays on Razorpay's page; the webhook that already exists is
 * what settles the invoice. Nothing here should ever be read as "they paid".
 */
export function PayNowButton({ restricted }: { restricted: boolean }) {
  const t = useTranslations('chrome.payNow');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const link = await api.paymentLink();
      /**
       * Same tab, not a popup. A popup blocker eating the one action that
       * clears a suspension is a failure the owner cannot diagnose — they see
       * a button that did nothing. Leaving the dashboard is fine: they come
       * back to it, and the banner will have been refreshed by the webhook.
       */
      window.location.assign(link.url);
    } catch (err) {
      /**
       * FR-06 — the banner still reads, and the message says what else to do.
       * `nothing_due` is the happy accident: the bill was settled between the
       * page rendering and the click, so say so rather than showing a failure.
       */
      const message =
        err instanceof ApiError && err.status === 409
          ? t('settled')
          : err instanceof ApiError
            ? err.message
            : t('failed');
      setError(message);
      setBusy(false);
    }
  }

  return (
    <span className="billing-banner-action">
      <button
        type="button"
        className={restricted ? 'billing-pay-now billing-pay-now-urgent' : 'billing-pay-now'}
        onClick={onClick}
        disabled={busy}
      >
        {busy ? t('opening') : t('pay')}
      </button>
      {error ? (
        <span className="billing-banner-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
