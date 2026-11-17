'use client';

import { useEffect, useState } from 'react';
import { api, type CustomerRewards } from './api';

/**
 * Jira GRW-648 — what this bill can do with this client's points, kept in step with the bill.
 *
 * One hook because there are two tills. The counter (`PayFlow`) and the visit sheet (`NewVisitSheet`) both
 * take money, and until 2026-10-27 only one of them knew rewards existed: the same client could spend their
 * points at the counter and not in the sheet, on the same bill, for the same business. A second copy of this
 * effect is how that happens again, so there is one.
 *
 * Nothing is worked out here. `maxRedeemable` and `discountMinor` are the API's answer, from the owner's cap
 * and floor and the customer's balance; this only asks the question at the right moments.
 */
export function useRewardQuote(clientId: string | null, billMinor: number) {
  /*
   * QA 2026-11-17 (finding 1) — the answer remembers the bill it was given for. It used to be kept as it was while a
   * changed bill was asked about again (300ms, then the network), so a 90% discount on ₹520 with 78 points on showed
   * "Total ₹0 — ₹52 less ₹78 in points": the old ₹78 off a ₹52 bill. Now points count only when the answer is for
   * THIS bill; until it is, nothing comes off, `checking` says so, and every till holds its payment for that moment.
   */
  const key = clientId && billMinor > 0 ? `${clientId}:${billMinor}` : null;
  const [answer, setAnswer] = useState<{ key: string; rewards: CustomerRewards | null } | null>(null);
  /*
   * QA 2026-11-17, finding 3 — the cashier's choice, kept apart from what the bill allows. Points used to be switched
   * OFF when a bill could not take them (90% off ₹520), and stayed off when the discount was removed: the screen went
   * from ₹442 to ₹520 without anyone touching the switch. Now a bill that cannot take points shows why; a bill that can
   * again spends them again; only the cashier's own tap turns them off — or a different guest, whose points they are not.
   */
  const [wanted, setWanted] = useState(false);
  useEffect(() => setWanted(false), [clientId]);

  useEffect(() => {
    if (!clientId || billMinor <= 0) {
      setAnswer(null);
      return;
    }
    const asked = `${clientId}:${billMinor}`;
    let live = true;
    const timer = setTimeout(() => {
      api
        .customerRewards(clientId, billMinor)
        .then((reply) => {
          if (!live) return;
          setAnswer({ key: asked, rewards: reply.enabled ? reply : null });
        })
        .catch(() => {
          if (!live) return;
          setAnswer({ key: asked, rewards: null });
        });
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [clientId, billMinor]);

  const fresh = answer !== null && answer.key === key;
  // The last answer stays on screen (the row does not blink away), but it is never spent against another bill.
  const rewards = answer?.rewards ?? null;
  const allowed = fresh && rewards !== null && rewards.maxRedeemable > 0;
  const spends = wanted && allowed;
  /** On, as the switch shows it: the cashier wants them and (as far as is known yet) the bill can take them. */
  const usePoints = wanted && (!fresh || allowed);
  return {
    rewards,
    usePoints,
    toggle: () => setWanted((on) => !on),
    redeemPoints: spends ? rewards.maxRedeemable : 0,
    redeemMinor: spends ? rewards.discountMinor : 0,
    /** Points are on and the bill changed: their answer for this bill is on its way. Hold the payment until it lands. */
    checking: wanted && key !== null && !fresh,
  };
}

const QUOTE_DEBOUNCE_MS = 300;
