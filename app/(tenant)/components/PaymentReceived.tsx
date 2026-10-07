'use client';

import { useEffect, useState } from 'react';
import { billingCopy } from '../lib/billing-copy';
import { IconCheck, IconClose } from './icons';
import type { Lang } from '../lib/lang';

/**
 * Jira GRW-556 (follow-up) — the acknowledgement: a payment arrived, thank you.
 *
 * The warning vanishing on its own is the product working, and says nothing. An owner who has just paid wants to be told it
 * arrived — on Billing, where they paid, and on Home, where they land. It only ever comes from a payment the provider's
 * webhook recorded (`recentPayment`), never from the click on Pay now.
 *
 * It can be closed. It is good news and it stays for two hours (owner, 2026-10-07 — it was three days), so it has to be dismissible — an owner who has read it should not
 * have it sit above their day. The dismissal is remembered per payment on this device (so closing it on Home also closes it on
 * Billing, and the NEXT payment is announced again) and costs nothing if storage is unavailable: it just shows again.
 */
const KEY = 'growza.paymentReceived.dismissed';
export function PaymentReceived({ payment, lang }: { payment: Payment; lang: Lang }) {
  const id = `${payment.paidOn}:${payment.amountMinor}`;
  // Not drawn until this device has been asked. The server cannot read the browser's storage, so drawing first and hiding
  // after made a closed notice flash and push the page down on every visit; drawing after the check means a closed one
  // never appears, and an open one appears once.
  const [closed, setClosed] = useState<boolean | null>(null);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(KEY) === id;
    } catch {
      /* storage blocked — the notice simply shows */
    }
    setClosed(dismissed);
  }, [id]);
  const close = () => {
    setClosed(true);
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      /* not remembered, still closed for now */
    }
  };
  if (closed !== false) return null;
  return <PaymentReceivedNotice payment={payment} lang={lang} onClose={close} />;
}

type Payment = { amountMinor: number; currency: string; paidOn: string };

/** What the notice says — drawn once `PaymentReceived` knows this device has not closed it. */
export function PaymentReceivedNotice({ payment, lang, onClose }: { payment: Payment; lang: Lang; onClose: () => void }) {
  const t = billingCopy(lang);
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const amount = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: payment.currency,
    maximumFractionDigits: payment.amountMinor % 100 === 0 ? 0 : 2,
  }).format(payment.amountMinor / 100);
  const [y, m, d] = payment.paidOn.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return (
    <div className="payment-received" role="status" data-testid="payment-received">
      <span aria-hidden="true" className="payment-received-tick">
        <IconCheck />
      </span>
      <div className="payment-received-text">
        <strong>{t.paymentReceived}</strong>
        <div>{t.paymentReceivedLine(amount, date)}</div>
      </div>
      <button type="button" className="payment-received-close" onClick={onClose} aria-label={t.closeNotice}>
        <IconClose />
      </button>
    </div>
  );
}
