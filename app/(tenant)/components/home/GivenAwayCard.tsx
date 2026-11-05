import type { DaySummary } from '../../lib/api';
import type { HomeCopy } from '../../lib/home-copy';
import { rupees } from './parts';

/**
 * Owner, 2026-11-06 — what the day's bills were charged below their price, on the day report.
 *
 * The till lets whoever settles a bill change its total, on purpose: a discount and a free service are both
 * ordinary. But a ₹500 haircut rung up at ₹0 read as done and paid, and the owner had no screen that said so.
 * The owner chose to be told here rather than have the desk refused.
 *
 * One card for both day sheets (a salon's and a shop's), so the two cannot word it differently. It is absent on a
 * day when every bill went out at its price: a card saying "₹0 on 0 bills" every evening is a card nobody reads on
 * the evening it matters. Absent too from an API that predates the figure.
 */
export function GivenAwayCard({ t, givenAway }: { t: HomeCopy; givenAway: DaySummary['givenAway'] }) {
  if (!givenAway || givenAway.bills === 0) return null;
  return (
    <section className="hm-card">
      <div className="hm-card-head">
        <h2>
          {t.chargedBelow} <small>{t.chargedBelowSub}</small>
        </h2>
      </div>
      <ul className="hm-rows">
        <li className="hm-row">
          <span className="hm-row-main">
            <span className="hm-row-name">{t.billCount(givenAway.bills)}</span>
          </span>
          <span className="hm-row-amount">{rupees(givenAway.minor)}</span>
        </li>
      </ul>
    </section>
  );
}
