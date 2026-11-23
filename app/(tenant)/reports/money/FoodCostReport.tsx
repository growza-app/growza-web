'use client';

import { useTranslations } from 'next-intl';
import { api, type MoneyReportQuery } from '../../lib/api';
import type { FoodCostReportPage, StockLossReportPage } from '../../lib/api-types';
import { useSession } from '../../components/SessionProvider';
import { MoneyEmpty, MoneyShell, useMoneyFormat, useMoneyReport } from './MoneyShell';
import { FoodCostClean, PeriodMenu } from './FoodCostClean';

/** Jira GRW-739 — the server reads up to 92 days at a time; the date fields never ask for more. */
export const FOOD_COST_MAX_DAYS = 92;

interface Both {
  food: FoodCostReportPage;
  loss: StockLossReportPage;
}
/** Module-level, so the hook's read is the same function on every render (it is a dependency of the load). */
const readBoth = async (q: MoneyReportQuery): Promise<Both> => {
  const [food, loss] = await Promise.all([api.foodCostReport(q), api.stockLossReport(q)]);
  return { food, loss };
};

/** Under this share of all sales costed, the % is shown but not called good or high (the API's FOOD_COST_JUDGED_FROM_PCT). */
const JUDGED_FROM_PCT = 80;
/** An older API sends no coverage: judged as before. */
const judgedOf = (r: FoodCostReportPage): boolean => typeof r.totals.coveredPct !== 'number' || r.totals.coveredPct >= JUDGED_FROM_PCT;

/**
 * Jira GRW-739 — Reports › Food cost: what the food in each day's sales cost, at the cost KEPT when each dish was cooked (a price that goes up
 * today leaves past days as they were). The share is over the sales of dishes that took food out at a known cost; dishes with no recipe are
 * said — "N dishes have no recipe (X% of sales)" with a link to fix them — never counted as 0%. Free bills are their own line. Below it,
 * what was wasted and what counts found missing, by item and entry, with who recorded it. Laid out at 344px: cards, no table.
 *
 * Jira GRW-741 — Inventory › Reports now (its old address sends you there), with what was used between the two.
 *
 * Owner, 2026-11-21 ("too much noise") — one layout at every width (FoodCostClean): the number, what needs attention,
 * then one table at a time. The phone's folded cards and the laptop's open panels (FoodCostDesk) are gone.
 */
export function FoodCostReport() {
  const t = useTranslations('moneyReports.foodCost');
  const f = useMoneyFormat();
  const timezone = useSession()?.timezone ?? 'Asia/Kolkata';
  const report = useMoneyReport<Both>(readBoth, { maxDays: FOOD_COST_MAX_DAYS });

  return (
    <MoneyShell report={report} toolbar={false}>
      {({ food: r, loss }) =>
        r.anySales ? (
          <FoodCostClean r={r} loss={loss} f={f} timezone={timezone} judged={judgedOf(r)} report={report} />
        ) : (
          <div className="fc2">
            <div className="fc2-hero fc2-hero-empty">
              <PeriodMenu report={report} f={f} />
            </div>
            {!r.tracking ? <p className="srp-warn">{t('notTracking')}</p> : null}
            <MoneyEmpty text={t('noSales')} />
          </div>
        )
      }
    </MoneyShell>
  );
}
