'use client';

import { useTranslations } from 'next-intl';
import AppLink from '../../../shared/AppLink';
import { api, type MoneyReportQuery } from '../../lib/api';
import type { FoodCostReportPage, MaterialUnit, StockLossReportPage } from '../../lib/api-types';
import { foodCostTone, pctText } from '../../lib/food-cost';
import { amount, unitWord } from '../../lib/kitchen-units';
import { useSession } from '../../components/SessionProvider';
import { MoneyEmpty, MoneyShell, useMoneyFormat, useMoneyReport } from './MoneyShell';

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

/** The % with its colour: amber above 35, red above 45, plain otherwise; "—" with no colour when there is no %. */
function Pct({ pct, big = false, judged = true }: { pct: number | null; big?: boolean; judged?: boolean }) {
  return <span className={`fc-pct ${big ? 'fc-pct-big' : ''} is-${judged ? foodCostTone(pct) : 'none'}`}>{pctText(pct)}</span>;
}

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
 */
export function FoodCostReport() {
  const t = useTranslations('moneyReports.foodCost');
  const f = useMoneyFormat();
  const timezone = useSession()?.timezone ?? 'Asia/Kolkata';
  const report = useMoneyReport<Both>(readBoth, { maxDays: FOOD_COST_MAX_DAYS });
  const qty = (thousandths: number, unit: MaterialUnit) => `${amount(thousandths)} ${unitWord(unit)}`;

  return (
    <MoneyShell report={report}>
      {({ food: r, loss }) => (
        <>
          {!r.tracking ? <p className="srp-warn">{t('notTracking')}</p> : null}
          {!r.anySales ? (
            <MoneyEmpty text={t('noSales')} />
          ) : (
            <>
              {/*
                Jira GRW-744 FR-05 — the answer first, in one sentence, then three tiles; everything else is folded below. Before, three
                different sales figures and about ten sections came before an owner knew whether the number was good.
              */}
              {/*
                QA 2026-11-19, problem 2 — a kitchen whose eggs and ghee had no price costed 46% of what it sold and still read "good". Under
                80% of sales costed, the % is said with how much it covers and not judged; the items to price are named right below.
              */}
              {(() => {
                const tone = foodCostTone(r.totals.foodCostPct);
                if (tone === 'none') return null;
                if (!judgedOf(r)) {
                  return (
                    <p className="fc-verdict is-partial" role="status">
                      {t('verdict.partial', { pct: pctText(r.totals.foodCostPct), covered: pctText(r.totals.coveredPct ?? null) })}
                    </p>
                  );
                }
                return (
                  <p className={`fc-verdict is-${tone}`} role="status">
                    {t(`verdict.${tone}`, { pct: pctText(r.totals.foodCostPct) })}
                  </p>
                );
              })()}
              {(r.noPrice.items ?? []).length > 0 ? (
                <div className="srp-warn fc-fix">
                  <span>{t('noPriceItems', { count: r.noPrice.items!.length, dishes: r.noPrice.dishes })}</span>
                  <span className="fc-item-links">
                    {r.noPrice.items!.map((i) => (
                      <AppLink key={i.materialId} className="fc-item-link" href={`/inventory?item=${encodeURIComponent(i.materialId)}`}>
                        {i.name}
                      </AppLink>
                    ))}
                  </span>
                </div>
              ) : null}
              <section className="srp-totals srp-kpi-grid" aria-label={t('title')}>
                <div className="srp-kpi-card is-primary">
                  <p className="srp-worth-label">{t('pctLabel')}</p>
                  <p className="srp-worth">
                    <Pct pct={r.totals.foodCostPct} big judged={judgedOf(r)} />
                  </p>
                  {/* Develop QA 2026-11-18, bug 4 — the % counts only dishes with a recipe; the sales it is out of are said here, once. */}
                  <p className="srp-hint">
                    {r.totals.costedSalesMinor === 0
                      ? t('pctNone')
                      : t('pctLineAll', { food: f.money(r.totals.foodMinor), sales: f.money(r.totals.costedSalesMinor), all: f.money(r.totals.salesMinor) })}
                  </p>
                </div>
                <div className="srp-kpi-card">
                  <p className="srp-worth-label">{t('foodLabel')}</p>
                  <p className="srp-kpi-num">{f.money(r.totals.foodMinor)}</p>
                </div>
                <div className="srp-kpi-card">
                  <p className="srp-worth-label">{t('lossLabel')}</p>
                  <p className="srp-kpi-num">{f.money(loss.totals.wastedMinor + loss.totals.lostMinor)}</p>
                </div>
              </section>

              {r.totals.givenFreeMinor > 0 ? (
                <p className="fc-line">{t('givenFree', { value: f.money(r.totals.givenFreeMinor), count: r.totals.freeBills })}</p>
              ) : null}
              {/*
                Jira GRW-743 FR-03 — a dish sold before its recipe was added is not told to get one: "Add their recipes" names only the dishes
                that still have none. An older API (no `stillMissing`) keeps the old list.
              */}
              {r.noRecipe.dishes > 0 ? (
                <div className="srp-warn fc-fix">
                  <span>{t('noRecipeSold', { count: r.noRecipe.dishes, pct: pctText(r.noRecipe.pctOfSales) })}</span>
                  {(r.noRecipe.stillMissing ?? r.noRecipe.names).length > 0 ? (
                    <>
                      <span className="fc-names">{t('stillMissing', { names: (r.noRecipe.stillMissing ?? r.noRecipe.names).join(', ') })}</span>
                      <AppLink className="mr-link" href="/stock?show=noRecipe">
                        {t('fixRecipes')}
                      </AppLink>
                    </>
                  ) : (
                    <span className="fc-names">{t('recipesInNow')}</span>
                  )}
                </div>
              ) : null}
              {r.noPrice.dishes > 0 && (r.noPrice.items ?? []).length === 0 ? <p className="srp-warn">{t('noPriceFix', { count: r.noPrice.dishes })}</p> : null}

              <details className="fc-more">
                <summary>{t('daysTitle')}</summary>
                <ul className="srp-list">
                  {[...r.days].reverse().map((d) => (
                    <li key={d.dateISO} className="srp-card">
                      <div className="srp-head">
                        <h3 className="srp-name">{f.day(d.dateISO)}</h3>
                        {d.salesMinor > 0 || d.foodMinor > 0 ? <Pct pct={d.foodCostPct} /> : <span className="srp-hint">{t('noSalesDay')}</span>}
                      </div>
                      {d.salesMinor > 0 || d.foodMinor > 0 ? (
                        <p className="srp-hint">
                          {t('dayLine', { sales: f.money(d.salesMinor), food: f.money(d.foodMinor) })}
                          {d.givenFreeMinor > 0 ? ` · ${t('dayFree', { value: f.money(d.givenFreeMinor) })}` : ''}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>

              {r.costliest.length > 0 ? (
                <details className="fc-more">
                  <summary>{t('costliestTitle')}</summary>
                  <ol className="srp-list">
                    {r.costliest.map((d) => (
                      <li key={d.name} className="srp-card">
                        <div className="srp-head">
                          <h3 className="srp-name">{d.name}</h3>
                          <Pct pct={d.foodCostPct} />
                        </div>
                        <p className="srp-hint">{t('dishLine', { qty: f.count(d.qty), sales: f.money(d.salesMinor), food: f.money(d.foodMinor) })}</p>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </>
          )}

          {/* Jira GRW-741 FR-06 — what the kitchen used, item by item: what the dishes sent took, less what came back before cooking. */}
          <details className="fc-more">
            <summary>{t('usedTitle')}</summary>
            {(loss.used ?? []).length === 0 ? (
              <MoneyEmpty text={t('noUsed')} />
            ) : (
              <>
                <p className="srp-hint">{t('usedNote')}</p>
                {(loss.used ?? []).some((u) => u.unpriced) ? <p className="srp-warn">{t('usedUnpriced')}</p> : null}
                <ul className="srp-list">
                  {(loss.used ?? []).map((u) => (
                    <li key={u.materialId} className="srp-card">
                      <div className="srp-head">
                        <h3 className="srp-name">{u.name}</h3>
                        <p className="srp-value">{f.money(u.valueMinor)}</p>
                      </div>
                      <p className="srp-hint">{qty(u.qty, u.unit)}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </details>

          <details className="fc-more">
            <summary>{t('lossTitle')}</summary>
            {loss.totals.entries === 0 ? (
              <MoneyEmpty text={t('noLoss')} />
            ) : (
              <>
                <section className="srp-totals srp-kpi-grid" aria-label={t('lossTitle')}>
                  <div className="srp-kpi-card">
                    <p className="srp-worth-label">{t('wasted')}</p>
                    <p className="srp-kpi-num">{f.money(loss.totals.wastedMinor)}</p>
                  </div>
                  <div className="srp-kpi-card">
                    <p className="srp-worth-label">{t('lost')}</p>
                    <p className="srp-kpi-num">{f.money(loss.totals.lostMinor)}</p>
                  </div>
                  {loss.totals.foundMinor > 0 ? (
                    <div className="srp-kpi-card">
                      <p className="srp-worth-label">{t('found')}</p>
                      <p className="srp-kpi-num">{f.money(loss.totals.foundMinor)}</p>
                    </div>
                  ) : null}
                </section>
                <p className="srp-hint">{t('lossNote')}</p>
                {loss.totals.unpricedEntries > 0 ? <p className="srp-warn">{t('lossUnpriced', { count: loss.totals.unpricedEntries })}</p> : null}

                <h3 className="mr-title">{t('byItemTitle')}</h3>
                <ul className="srp-list">
                  {loss.byItem.map((i) => (
                    <li key={i.materialId} className="srp-card">
                      <div className="srp-head">
                        <h4 className="srp-name">{i.name}</h4>
                        <p className="srp-value">{f.money(i.wastedMinor + i.lostMinor)}</p>
                      </div>
                      <p className="srp-hint">
                        {[
                          i.wastedQty > 0 ? t('itemWasted', { qty: qty(i.wastedQty, i.unit) }) : null,
                          i.lostQty > 0 ? t('itemLost', { qty: qty(i.lostQty, i.unit) }) : null,
                          i.foundQty > 0 ? t('itemFound', { qty: qty(i.foundQty, i.unit) }) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>

                <h3 className="mr-title">{t('entriesTitle')}</h3>
                <ul className="srp-list">
                  {loss.entries.map((e, n) => (
                    <li key={`${e.atISO}-${n}`} className="srp-card">
                      <div className="srp-head">
                        <h4 className="srp-name">
                          {e.name} · {t(`kind.${e.kind}`)}
                        </h4>
                        <p className="srp-value">{e.valueMinor === null ? t('noPriceShort') : f.money(e.valueMinor)}</p>
                      </div>
                      <p className="srp-hint">
                        {[qty(e.qty, e.unit), f.when(e.atISO, timezone), e.reason ? t(`reason.${e.reason}`) : null, e.dish, e.note, e.by ? t('by', { name: e.by }) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
                {loss.moreEntries > 0 ? <p className="srp-hint">{t('moreEntries', { count: loss.moreEntries })}</p> : null}
              </>
            )}
          </details>
          <p className="srp-hint">{t('costNote')}</p>
          <p className="srp-hint">{t('rangeHint')}</p>
        </>
      )}
    </MoneyShell>
  );
}
