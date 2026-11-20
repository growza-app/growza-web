'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import AppLink from '../../../shared/AppLink';
import type { FoodCostReportPage, MaterialUnit, StockLossReportPage } from '../../lib/api-types';
import { foodCostTone, pctText } from '../../lib/food-cost';
import { amount, unitWord } from '../../lib/kitchen-units';
import type { useMoneyFormat } from './MoneyShell';

type Fmt = ReturnType<typeof useMoneyFormat>;

/**
 * Owner, 2026-11-20 ("redesign the reports tab too") — Inventory › Reports on a laptop (1101px up, the Menu's edge).
 * The phone's report is an answer, three tiles and four folded sections; on a wide screen the folds cost a click
 * each and the cards left two thirds of the width empty. Here: the answer, four even figures, one "To fix" card
 * for what keeps the % from being whole, and the four sections open, side by side, as tables.
 */
export function FoodCostDesk({
  r,
  loss,
  f,
  timezone,
  judged,
}: {
  r: FoodCostReportPage;
  loss: StockLossReportPage;
  f: Fmt;
  timezone: string;
  judged: boolean;
}) {
  const t = useTranslations('moneyReports.foodCost');
  const td = useTranslations('moneyReports.foodCost.desk');
  const qty = (thousandths: number, unit: MaterialUnit) => `${amount(thousandths)} ${unitWord(unit)}`;
  const pct = (p: number | null, isJudged = true) => <span className={`fc-pct is-${isJudged ? foodCostTone(p) : 'none'}`}>{pctText(p)}</span>;
  const noPriceItems = r.noPrice.items ?? [];
  const missing = r.noRecipe.stillMissing ?? r.noRecipe.names;
  const used = loss.used ?? [];

  return (
    <div className="fcd">
      <section className="fcd-kpis" aria-label={t('title')}>
        <div className="fcd-kpi">
          <span className="fcd-kpi-l">{t('pctLabel')}</span>
          <span className="fcd-kpi-n">{pct(r.totals.foodCostPct, judged)}</span>
          <span className="fcd-kpi-s">{r.totals.costedSalesMinor === 0 ? t('pctNone') : t('pctLine', { food: f.money(r.totals.foodMinor), sales: f.money(r.totals.costedSalesMinor) })}</span>
        </div>
        <div className="fcd-kpi">
          <span className="fcd-kpi-l">{t('foodLabel')}</span>
          <span className="fcd-kpi-n">{f.money(r.totals.foodMinor)}</span>
          <span className="fcd-kpi-s">{td('foodSub', { all: f.money(r.totals.salesMinor) })}</span>
        </div>
        <div className="fcd-kpi">
          <span className="fcd-kpi-l">{t('lossLabel')}</span>
          <span className="fcd-kpi-n">{f.money(loss.totals.wastedMinor + loss.totals.lostMinor)}</span>
          <span className="fcd-kpi-s">{td('lossSub', { wasted: f.money(loss.totals.wastedMinor), lost: f.money(loss.totals.lostMinor) })}</span>
        </div>
        <div className="fcd-kpi">
          <span className="fcd-kpi-l">{td('coveredLabel')}</span>
          <span className="fcd-kpi-n">{typeof r.totals.coveredPct === 'number' ? pctText(r.totals.coveredPct) : '—'}</span>
          <span className="fcd-kpi-s">
            {r.totals.givenFreeMinor > 0
              ? t('givenFree', { value: f.money(r.totals.givenFreeMinor), count: r.totals.freeBills })
              : td('coveredSub', { sales: f.money(r.totals.costedSalesMinor), all: f.money(r.totals.salesMinor) })}
          </span>
        </div>
      </section>

      {noPriceItems.length > 0 || r.noRecipe.dishes > 0 || (r.noPrice.dishes > 0 && noPriceItems.length === 0) ? (
        <section className="fcd-fix" aria-label={td('fixTitle')}>
          <h2 className="fcd-fix-title">{td('fixTitle')}</h2>
          {noPriceItems.length > 0 ? (
            <div className="fcd-fix-row">
              <span>{t('noPriceItems', { count: noPriceItems.length, dishes: r.noPrice.dishes })}</span>
              <span className="fc-item-links">
                {noPriceItems.map((i) => (
                  <AppLink key={i.materialId} className="fc-item-link" href={`/inventory?item=${encodeURIComponent(i.materialId)}`}>
                    {i.name}
                  </AppLink>
                ))}
              </span>
            </div>
          ) : null}
          {r.noPrice.dishes > 0 && noPriceItems.length === 0 ? <div className="fcd-fix-row">{t('noPriceFix', { count: r.noPrice.dishes })}</div> : null}
          {r.noRecipe.dishes > 0 ? (
            <div className="fcd-fix-row">
              <span>
                {t('noRecipeSold', { count: r.noRecipe.dishes, pct: pctText(r.noRecipe.pctOfSales) })}
                {missing.length > 0 ? ` — ${t('stillMissing', { names: missing.join(', ') })}` : ` — ${t('recipesInNow')}`}
              </span>
              {missing.length > 0 ? (
                <AppLink className="fcd-fix-link" href="/stock?show=noRecipe">
                  {t('fixRecipes')}
                </AppLink>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="fcd-grid">
        <Panel title={t('daysTitle')}>
          <table className="fcd-table">
            <thead>
              <tr>
                <th>{td('cols.day')}</th>
                <th className="fcd-num">{td('cols.sales')}</th>
                <th className="fcd-num">{td('cols.food')}</th>
                <th className="fcd-num">{td('cols.pct')}</th>
              </tr>
            </thead>
            <tbody>
              {[...r.days].reverse().map((d) => {
                const any = d.salesMinor > 0 || d.foodMinor > 0;
                return (
                  <tr key={d.dateISO}>
                    <td>{f.day(d.dateISO)}</td>
                    <td className="fcd-num">{any ? f.money(d.salesMinor) : <span className="fcd-muted">{t('noSalesDay')}</span>}</td>
                    <td className="fcd-num">{any ? f.money(d.foodMinor) : '—'}</td>
                    <td className="fcd-num">{any ? pct(d.foodCostPct) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title={t('costliestTitle')}>
          {r.costliest.length === 0 ? (
            <p className="fcd-empty">—</p>
          ) : (
            <table className="fcd-table">
              <thead>
                <tr>
                  <th>{td('cols.dish')}</th>
                  <th className="fcd-num">{td('cols.sold')}</th>
                  <th className="fcd-num">{td('cols.sales')}</th>
                  <th className="fcd-num">{td('cols.food')}</th>
                  <th className="fcd-num">{td('cols.pct')}</th>
                </tr>
              </thead>
              <tbody>
                {r.costliest.map((d) => (
                  <tr key={d.name}>
                    <td className="fcd-strong">{d.name}</td>
                    <td className="fcd-num">{f.count(d.qty)}</td>
                    <td className="fcd-num">{f.money(d.salesMinor)}</td>
                    <td className="fcd-num">{f.money(d.foodMinor)}</td>
                    <td className="fcd-num">{pct(d.foodCostPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title={t('usedTitle')} note={used.length > 0 ? t('usedNote') : undefined}>
          {used.length === 0 ? (
            <p className="fcd-empty">{t('noUsed')}</p>
          ) : (
            <>
              {used.some((u) => u.unpriced) ? <p className="fcd-warn">{t('usedUnpriced')}</p> : null}
              <table className="fcd-table">
                <thead>
                  <tr>
                    <th>{td('cols.item')}</th>
                    <th className="fcd-num">{td('cols.qty')}</th>
                    <th className="fcd-num">{td('cols.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {used.map((u) => (
                    <tr key={u.materialId}>
                      <td className="fcd-strong">{u.name}</td>
                      <td className="fcd-num">{qty(u.qty, u.unit)}</td>
                      <td className="fcd-num">{f.money(u.valueMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>

        <Panel title={t('lossTitle')} note={loss.totals.entries > 0 ? t('lossNote') : undefined}>
          {loss.totals.entries === 0 ? (
            <p className="fcd-empty">{t('noLoss')}</p>
          ) : (
            <>
              {loss.totals.unpricedEntries > 0 ? <p className="fcd-warn">{t('lossUnpriced', { count: loss.totals.unpricedEntries })}</p> : null}
              <table className="fcd-table">
                <thead>
                  <tr>
                    <th>{td('cols.item')}</th>
                    <th className="fcd-num">{t('wasted')}</th>
                    <th className="fcd-num">{td('cols.missing')}</th>
                    {loss.totals.foundMinor > 0 ? <th className="fcd-num">{td('cols.found')}</th> : null}
                    <th className="fcd-num">{td('cols.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loss.byItem.map((i) => (
                    <tr key={i.materialId}>
                      <td className="fcd-strong">{i.name}</td>
                      <td className="fcd-num">{i.wastedQty > 0 ? qty(i.wastedQty, i.unit) : '—'}</td>
                      <td className="fcd-num">{i.lostQty > 0 ? qty(i.lostQty, i.unit) : '—'}</td>
                      {loss.totals.foundMinor > 0 ? <td className="fcd-num">{i.foundQty > 0 ? qty(i.foundQty, i.unit) : '—'}</td> : null}
                      <td className="fcd-num">{f.money(i.wastedMinor + i.lostMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>
      </div>

      {loss.entries.length > 0 ? (
        <Panel title={t('entriesTitle')}>
          <table className="fcd-table">
            <thead>
              <tr>
                <th>{td('cols.when')}</th>
                <th>{td('cols.item')}</th>
                <th>{td('cols.kind')}</th>
                <th className="fcd-num">{td('cols.qty')}</th>
                <th>{td('cols.why')}</th>
                <th>{td('cols.by')}</th>
                <th className="fcd-num">{td('cols.value')}</th>
              </tr>
            </thead>
            <tbody>
              {loss.entries.map((e, n) => (
                <tr key={`${e.atISO}-${n}`}>
                  <td className="fcd-muted">{f.when(e.atISO, timezone)}</td>
                  <td className="fcd-strong">{e.name}</td>
                  <td>
                    <span className={`fcd-kind is-${e.kind}`}>{t(`kind.${e.kind}`)}</span>
                  </td>
                  <td className="fcd-num">{qty(e.qty, e.unit)}</td>
                  <td className="fcd-muted">{[e.reason ? t(`reason.${e.reason}`) : null, e.dish, e.note].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="fcd-muted">{e.by ?? '—'}</td>
                  <td className="fcd-num">{e.valueMinor === null ? t('noPriceShort') : f.money(e.valueMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loss.moreEntries > 0 ? <p className="fcd-note">{t('moreEntries', { count: loss.moreEntries })}</p> : null}
        </Panel>
      ) : null}

      <p className="fcd-note">
        {t('costNote')} {t('rangeHint')}
      </p>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="fcd-panel" aria-label={title}>
      <header className="fcd-panel-head">
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </header>
      <div className="fcd-panel-body">{children}</div>
    </section>
  );
}
