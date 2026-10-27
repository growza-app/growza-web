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
  const [rewards, setRewards] = useState<CustomerRewards | null>(null);
  const [usePoints, setUsePoints] = useState(false);

  useEffect(() => {
    if (!clientId || billMinor <= 0) {
      setRewards(null);
      setUsePoints(false);
      return;
    }
    let live = true;
    /*
     * Debounced, because the bill changes with every tile tapped and every amount typed, and this is a
     * round trip per change otherwise. A fifth of a second below the pause between finishing a bill and
     * reaching for the payment tiles.
     */
    const timer = setTimeout(() => {
      api
        .customerRewards(clientId, billMinor)
        .then((answer) => {
          if (!live) return;
          /*
           * Kept whenever rewards are ON, not only when this bill can spend them: a client with ten points
           * showed the desk nothing at all, and nobody could tell them they had any. What the bill can take
           * decides the TOGGLE; the balance is shown either way.
           */
          setRewards(answer.enabled ? answer : null);
          if (!answer.enabled || answer.maxRedeemable <= 0) setUsePoints(false);
        })
        .catch(() => {
          /*
           * A failed read leaves the bill alone. The desk can still take the money, which is the thing that
           * matters with somebody standing at the counter; the points are still theirs tomorrow.
           */
          if (!live) return;
          setRewards(null);
          setUsePoints(false);
        });
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [clientId, billMinor]);

  return {
    rewards,
    usePoints,
    toggle: () => setUsePoints((on) => !on),
    /** What this bill spends, and what that takes off it. Zero unless the toggle is on. */
    redeemPoints: usePoints && rewards ? rewards.maxRedeemable : 0,
    redeemMinor: usePoints && rewards ? rewards.discountMinor : 0,
  };
}

/** Not the search debounce: this waits for a BILL to settle, not for fingers to stop. */
const QUOTE_DEBOUNCE_MS = 300;
