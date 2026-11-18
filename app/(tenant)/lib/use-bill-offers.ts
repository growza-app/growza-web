'use client';

import { useEffect, useState } from 'react';
import { api, type BillOffersQuote } from './api';

/**
 * Jira GRW-735 — what the owner's coupons and buy-get offers take off this bill, asked of the server as the bill
 * changes. Nothing is worked out here: the quote is the same arithmetic the payment runs, and the payment asks again.
 *
 * Like the points quote, an answer counts only for the bill it was asked about; while a changed bill is being asked
 * about, `checking` is true and the till holds the payment for that moment.
 */
export type OffersAsk =
  | { saleId: string; couponCode: string | null; discountMinor: number; redeemMinor?: number }
  | {
      location: string;
      products: Array<{ productId: string; qty: number; paidMinor: number }>;
      couponCode: string | null;
      discountMinor: number;
      customerId: string | null;
      /** L2 — a new guest's phone number, typed at the till (they have no id yet). */
      customerPhone?: string;
      /** Jira GRW-736 — what points take off, so GST added on top is worked out after them; and how the order is eaten. */
      redeemMinor?: number;
      orderType?: 'dine_in' | 'takeaway' | 'delivery';
    }
  | null;

const DEBOUNCE_MS = 250;

export function useBillOffers(ask: OffersAsk) {
  const key = ask ? JSON.stringify(ask) : null;
  const [answer, setAnswer] = useState<{ key: string; quote: BillOffersQuote | null } | null>(null);
  useEffect(() => {
    if (!key) {
      setAnswer(null);
      return;
    }
    let live = true;
    const body = JSON.parse(key) as NonNullable<OffersAsk>;
    const timer = setTimeout(() => {
      api
        .billOffersQuote({ ...body, couponCode: body.couponCode ?? undefined, ...('customerId' in body ? { customerId: body.customerId ?? undefined } : {}) })
        .then((quote) => live && setAnswer({ key, quote }))
        .catch(() => live && setAnswer({ key, quote: null }));
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key]);
  const fresh = answer !== null && answer.key === key ? answer.quote : null;
  const bogo = fresh?.bogo ?? [];
  const bogoMinor = bogo.reduce((s, o) => s + o.offMinor, 0);
  /** The coupon stands: typed, good on this bill, and not smaller than the counter's discount. */
  const couponKept = Boolean(fresh?.coupon) && fresh?.kept !== 'discount';
  return {
    checking: key !== null && (answer === null || answer.key !== key),
    bogo,
    bogoMinor,
    coupon: fresh?.coupon ?? null,
    couponRefusal: fresh?.couponRefusal ?? null,
    kept: fresh?.kept ?? null,
    couponKept,
    /** What the offers the server will apply take off: the buy-get offers, and the coupon when it is kept. */
    offersMinor: bogoMinor + (couponKept ? (fresh?.coupon?.offMinor ?? 0) : 0),
    /**
     * Review of the overnight stack (item 1) — what the bill's lines come to after its buy-get offers, never the GST added
     * on top: what a coupon, the discount and the whole-bill-free rule are measured against, as the payment measures them.
     */
    billMinor: fresh?.billMinor ?? null,
    /** Jira GRW-736 — GST added on top: what the guest pays is the server's figure, with it. */
    taxOnTop: Boolean(fresh?.taxOnTop),
    taxMinor: fresh?.taxMinor ?? 0,
    dueMinor: fresh?.dueMinor ?? null,
  };
}
