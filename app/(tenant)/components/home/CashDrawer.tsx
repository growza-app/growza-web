import type { CashDrawerFigure } from '../../lib/home-types';
import type { HomeCopy } from '../../lib/home-copy';
import { rupees } from './parts';

/**
 * Owner, 2026-11-06 — the notes that should be in the till: the cash taken today, less the cash handed back today.
 *
 * "How they paid" splits the day's takings, and a cash bill refunded by UPI never shows there as cash leaving. This
 * is the other count — the one somebody cashing up asks for — and it is its own figure with its own name rather
 * than a correction of the split. It knows nothing of the float the till opened with.
 *
 * Absent from an API that predates it, and on a day with no cash moving either way: a line saying "₹0" under every
 * quiet evening is a line nobody reads on the evening it matters.
 */
const moving = (d: CashDrawerFigure | undefined): d is CashDrawerFigure => d !== undefined && (d.takenMinor > 0 || d.refundedMinor > 0);

/** One line under the money on Home. */
export function CashDrawerLine({ t, cashDrawer }: { t: HomeCopy; cashDrawer: CashDrawerFigure | undefined }) {
  if (!moving(cashDrawer)) return null;
  return (
    <p className="hm-line hm-line-drawer">
      <span className="hm-line-item">
        {t.cashInDrawer} <b>{rupees(cashDrawer.inDrawerMinor)}</b>
      </span>
    </p>
  );
}

/** The day sheet's card: what came in, what went out, what is left. */
export function CashDrawerCard({ t, cashDrawer }: { t: HomeCopy; cashDrawer: CashDrawerFigure | undefined }) {
  if (!moving(cashDrawer)) return null;
  return (
    <section className="hm-card">
      <div className="hm-card-head">
        <h2>
          {t.cashInDrawer} <small>{t.cashInDrawerSub}</small>
        </h2>
      </div>
      <ul className="hm-rows">
        <li className="hm-row">
          <span className="hm-row-main">
            <span className="hm-row-name">{t.cashTaken}</span>
          </span>
          <span className="hm-row-amount">{rupees(cashDrawer.takenMinor)}</span>
        </li>
        <li className="hm-row">
          <span className="hm-row-main">
            <span className="hm-row-name">{t.cashHandedBack}</span>
          </span>
          <span className="hm-row-amount">{cashDrawer.refundedMinor > 0 ? `−${rupees(cashDrawer.refundedMinor)}` : rupees(0)}</span>
        </li>
        <li className="hm-row hm-row-total">
          <span className="hm-row-main">
            <span className="hm-row-name">
              <strong>{t.cashLeft}</strong>
            </span>
          </span>
          <span className="hm-row-amount">
            <strong>{rupees(cashDrawer.inDrawerMinor)}</strong>
          </span>
        </li>
      </ul>
    </section>
  );
}
