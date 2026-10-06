'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { billingCopy } from '../lib/billing-copy';
import type { Lang } from '../lib/lang';

/**
 * Jira GRW-556 (follow-up) — "we are confirming your payment", for the few seconds between Razorpay sending the owner back
 * and its webhook marking the bill Paid.
 *
 * The owner comes back from the payment page to a screen that still says they owe money, because the webhook has not landed
 * yet. Left alone that reads as "it did not work" and invites a second payment. So the screen says what is happening and
 * re-reads itself every few seconds; the moment the bill is Paid the Pay card is gone and "payment received" takes its place,
 * with no tap from the owner. It stops after about a minute: if the bank has not answered by then the owner is told so.
 *
 * Only for a return that says it was PAID. Razorpay appends `razorpay_payment_link_status` to the address it sends the owner
 * back to; an owner who closed the payment page, or came back with any other status, is not told a payment is on its way.
 * And the marker is read ONCE and then taken out of the address bar, so a refresh, a bookmark or next month's visit to the
 * same URL does not announce a payment that never happened. The answer lives in this component's state from then on, which
 * survives the `router.refresh()` that re-reads the bill.
 */
const EVERY_MS = 3000;
const GIVE_UP_AFTER = 20;
const MARKERS = ['paid', 'razorpay_payment_id', 'razorpay_payment_link_id', 'razorpay_payment_link_reference_id', 'razorpay_payment_link_status', 'razorpay_signature'];

/** A return that says the payment went through: our own marker, and Razorpay's status when it sends one. */
export function cameBackPaid(params: URLSearchParams): boolean {
  if (params.get('paid') !== '1') return false;
  const status = params.get('razorpay_payment_link_status');
  return status === null || status === 'paid';
}

export function PaymentConfirming({ lang, phone }: { lang: Lang; phone?: string }) {
  const t = billingCopy(lang);
  const router = useRouter();
  const params = useSearchParams();
  // Decided once, from the address the owner arrived at.
  const [confirming] = useState(() => cameBackPaid(new URLSearchParams(params.toString())));
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!params.has('paid')) return;
    const url = new URL(window.location.href);
    for (const key of MARKERS) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    // Only on arrival (empty deps on purpose): the cleaned address is the one every later read sees.
  }, []);

  useEffect(() => {
    if (!confirming || tries >= GIVE_UP_AFTER) return;
    const timer = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, EVERY_MS);
    return () => clearTimeout(timer);
  }, [confirming, tries, router]);

  if (!confirming) return null;
  const gaveUp = tries >= GIVE_UP_AFTER;
  return (
    <p className="pay-card-confirming" role="status" data-testid="confirming">
      {gaveUp ? t.payStillConfirming : t.payConfirming}
      {gaveUp && phone ? (
        <>
          {' '}
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>
        </>
      ) : null}
    </p>
  );
}
