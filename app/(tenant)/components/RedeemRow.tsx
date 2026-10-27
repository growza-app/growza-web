'use client';

import { useTranslations } from 'next-intl';
import { formatMoney, type CustomerRewards } from '../lib/api';

/**
 * Jira GRW-648 — reward points on a bill, for every till that takes money.
 *
 * One row with three states, and the reason it is a component rather than markup in a screen is that there
 * are two tills: the counter (`PayFlow`) and the visit sheet (`NewVisitSheet`). A second copy of this would
 * drift -- different words for the same balance, a toggle on one screen and not the other -- which is
 * exactly what the two of them had until 2026-10-27, when the sheet had no rewards at all.
 *
 *   can be spent   [toggle] Use 30 points / 42 points saved          ₹30 off
 *   bill too small          42 points saved / a bill of ₹125 to use them
 *   too few points          3 points saved / 22 more to use them
 *
 * Nothing at all for somebody with no points: an empty frame is worse than no frame.
 *
 * What a bill can take is `maxRedeemable`, which the API decides from the owner's cap, floor and the
 * customer's balance. Nothing here works that out again, and tapping the toggle spends the most this bill
 * allows -- there is no box to type a number into, because the three rules have already decided the answer
 * and a till is not the place to do arithmetic at somebody.
 */
export function RedeemRow({
  rewards,
  usePoints,
  onToggle,
  disabled = false,
}: {
  /** The quote for THIS bill, or null when rewards are off, nobody is named, or the read failed. */
  rewards: CustomerRewards | null;
  usePoints: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations('payFlow.rewards');
  const money = (minor: number) => formatMoney(String(minor));
  if (!rewards || (rewards.maxRedeemable === 0 && rewards.balance === 0)) return null;

  const have = t('have', { points: rewards.balance });
  /*
   * Three different reasons it cannot be spent, and only the first is the one anybody guesses.
   *
   * The hold goes first (QA 2026-10-27, loophole L3): a client holding 94 points with all 94 still waiting
   * is not short of points and the bill is not too small, so either of the other two sentences would be a
   * lie. 0 for every business that keeps no hold, which is the default and therefore most of them.
   */
  const shortBy = rewards.minRedeemPoints - rewards.balance;
  const why =
    rewards.heldPoints > 0
      ? t('held', { points: rewards.heldPoints })
      : shortBy > 0
        ? t('needMore', { points: shortBy })
        : t('needBill', { amount: money(rewards.minBillMinor) });

  return (
    <div className="pf-redeem">
      {rewards.maxRedeemable > 0 ? (
        <>
          <label className="switch">
            <input type="checkbox" aria-labelledby="pf-redeem-label" checked={usePoints} disabled={disabled} onChange={onToggle} />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </label>
          <span id="pf-redeem-label" className="pf-redeem-label">
            {t('offer', { points: rewards.maxRedeemable })}
            <span className="pf-redeem-have">{have}</span>
          </span>
          <strong className="pf-redeem-off">{t('off', { amount: money(rewards.discountMinor) })}</strong>
        </>
      ) : (
        <span className="pf-redeem-label pf-redeem-quiet">
          {have}
          <span className="pf-redeem-have">{why}</span>
        </span>
      )}
    </div>
  );
}
