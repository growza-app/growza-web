'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState, type ReactNode } from 'react';
import AppLink from '../../../shared/AppLink';
import type { FoodCostReportPage, MaterialUnit, StockLossReportPage } from '../../lib/api-types';
import { foodCostTone } from '../../lib/food-cost';
import { amount, unitWord } from '../../lib/kitchen-units';
import { presetRange, REPORT_PRESETS, type ReportPreset } from '../../lib/report-dates';
import { useAnchoredPanel } from '../../lib/useAnchoredPanel';
import { GraphicSvg } from '../../components/ProductPhoto';
import { IconReceipt, IconRupee, IconTrash } from '../../components/icons';
import type { useMoneyFormat, useMoneyReport } from './MoneyShell';

type Fmt = ReturnType<typeof useMoneyFormat>;
type Report = ReturnType<typeof useMoneyReport<unknown>>;
type Tab = 'dishes' | 'days' | 'ingredients' | 'waste' | 'log';

/**
 * Owner, 2026-11-21 ("the page has too much noise, not like a professional website") — Inventory › Reports as a report
 * reads: one number, what needs attention, then one table at a time. Before: twelve boxes, about fifteen sentences of
 * explanation, four tables open together and seven controls at the top.
 *
 *   Food cost  24.8%  ● Partial — only 39% of sales have a recipe            [ Last 7 days ▾ ]
 *   Food used ₹1,843 │ Wasted and missing ₹1,310 │ Sales ₹19,080
 *   Needs attention   two short rows, each with what to do
 *   Dishes · Days · Ingredients · Waste · Log     one table
 *
 * Colour is spent on the food cost and its status dot only; the explanations sit behind ⓘ. One layout at every width:
 * on a phone the number columns fold into a line under each name.
 */
/** Which "Not sure yet" line: missing prices, missing recipes, both, or neither named (another reason). */
export function partialWhy(noPrice: boolean, noRecipe: boolean): 'status.partialBoth' | 'status.partialPrice' | 'status.partialRecipe' | 'status.partial' {
  if (noPrice && noRecipe) return 'status.partialBoth';
  if (noPrice) return 'status.partialPrice';
  if (noRecipe) return 'status.partialRecipe';
  return 'status.partial';
}

export function FoodCostClean({
  r,
  loss,
  f,
  timezone,
  judged,
  report,
}: {
  r: FoodCostReportPage;
  loss: StockLossReportPage;
  f: Fmt;
  timezone: string;
  judged: boolean;
  report: Pick<Report, 'dates' | 'onDates' | 'todayISO'>;
}) {
  const t = useTranslations('moneyReports.foodCost');
  const td = useTranslations('moneyReports.foodCost.desk');
  const tc = useTranslations('moneyReports.foodCost.clean');
  const [tab, setTab] = useState<Tab>('dishes');
  const qty = (thousandths: number, unit: MaterialUnit) => `${amount(thousandths)} ${unitWord(unit)}`;
  const tone = judged ? foodCostTone(r.totals.foodCostPct) : 'partial';
  const used = loss.used ?? [];
  const noPriceItems = r.noPrice.items ?? [];
  const missing = r.noRecipe.stillMissing ?? r.noRecipe.names;
  const sellingDays = [...r.days].reverse().filter((d) => d.salesMinor > 0 || d.foodMinor > 0);
  const quietDays = r.days.length - sellingDays.length;
  const people = new Set(loss.entries.map((e) => e.by ?? '')).size;
  /*
   * Owner, 2026-11-21 ("can a common man understand this?") — a percentage is said as rupees out of ₹100 sold: 24.8% is
   * "₹25 of every ₹100", the way an owner already thinks about a dish. Over ₹100 the dish costs more than it sells for.
   */
  const per100 = (p: number | null) => (p === null || !Number.isFinite(p) ? '—' : `₹${p > 0 ? Math.max(1, Math.round(p)) : 0}`);
  const pill = (p: number | null) => (
    <span className={`fc2-pct is-${foodCostTone(p)}`}>
      {per100(p)}
      {p !== null && p > 100 ? <span className="fc2-loses">{tc('losesMoney')}</span> : null}
    </span>
  );

  /**
   * Develop QA 2026-11-21, finding 5 — the status names what actually keeps the number from being whole. It said "many dishes
   * sold have no recipe" when 14 dishes were out for want of four prices and one for want of a recipe.
   */
  // What keeps the number from being whole, as short rows — each says what is wrong and where to put it right.
  const attention: { key: string; text: string; detail?: ReactNode; action?: ReactNode }[] = [];
  if (!r.tracking) attention.push({ key: 'tracking', text: t('notTracking') });
  if (noPriceItems.length > 0) {
    attention.push({
      key: 'price',
      text: tc('noPriceRow', { count: noPriceItems.length, dishes: r.noPrice.dishes }),
      detail: (
        <span className="fc2-links">
          {noPriceItems.map((i) => (
            <AppLink key={i.materialId} className="fc2-link" href={`/inventory?item=${encodeURIComponent(i.materialId)}`}>
              {i.name}
            </AppLink>
          ))}
        </span>
      ),
    });
  } else if (r.noPrice.dishes > 0) {
    attention.push({ key: 'price', text: t('noPriceFix', { count: r.noPrice.dishes }) });
  }
  if (r.noRecipe.dishes > 0 && missing.length > 0) {
    attention.push({
      key: 'recipe',
      text: tc('noRecipeRow', { count: missing.length }),
      detail: <span className="fc2-names">{missing.join(', ')}</span>,
      action: (
        <AppLink className="fc2-action" href="/stock?show=noRecipe">
          {tc('addRecipes')}
        </AppLink>
      ),
    });
  }
  if (loss.totals.unpricedEntries > 0) attention.push({ key: 'loss', text: t('lossUnpriced', { count: loss.totals.unpricedEntries }) });

  const tabs: { key: Tab; label: string; n?: number }[] = [
    { key: 'dishes', label: tc('tabs.dishes'), n: r.costliest.length },
    { key: 'days', label: tc('tabs.days') },
    { key: 'ingredients', label: tc('tabs.ingredients'), n: used.length },
    { key: 'waste', label: tc('tabs.waste'), n: loss.byItem.length },
    { key: 'log', label: tc('tabs.log'), n: loss.entries.length },
  ];

  return (
    <div className="fc2">
      <section className="fc2-hero" aria-label={tc('heroLabel')}>
        <div className="fc2-hero-main">
          <div className="fc2-label">
            {tc('heroLabel')}
            <Info label={tc('how')}>
              <p>{tc('howText')}</p>
              <p>{tc('rangeShort')}</p>
            </Info>
          </div>
          <div className="fc2-number">
            <span className={`fc2-big is-${tone}`}>{per100(r.totals.foodCostPct)}</span>
            <span className="fc2-per">{tc('perHundred')}</span>
            <span className={`fc2-status is-${tone}`}>
              <span className="fc2-dot" aria-hidden="true" />
              {tone === 'partial'
                ? tc(partialWhy(r.noPrice.dishes > 0, r.noRecipe.dishes > 0))
                : tone === 'none'
                  ? tc('status.none')
                  : tc(`status.${tone}`)}
            </span>
          </div>
        </div>
        <PeriodMenu report={report} f={f} />
      </section>

      {/* Owner, 2026-11-21 ("some colours of tiles can be added") — the three figures as soft tiles, each its own colour
          and icon: what the kitchen spent (teal), what was thrown away or went missing (amber, money lost), what came in
          (green). Colour here names the figure; the food cost above keeps its own tone. */}
      <dl className="fc2-stats">
        <div className="fc2-stat is-spent">
          <span className="fc2-stat-icon" aria-hidden="true">
            <GraphicSvg kind="handi" />
          </span>
          <div>
            <dt>{tc('statFood')}</dt>
            <dd>{f.money(r.totals.foodMinor)}</dd>
          </div>
        </div>
        <div className="fc2-stat is-lost">
          <span className="fc2-stat-icon" aria-hidden="true">
            <IconTrash />
          </span>
          <div>
            <dt>{tc('statLoss')}</dt>
            <dd>{f.money(loss.totals.wastedMinor + loss.totals.lostMinor)}</dd>
          </div>
        </div>
        <div className="fc2-stat is-sales">
          <span className="fc2-stat-icon" aria-hidden="true">
            <IconRupee />
          </span>
          <div>
            <dt>{tc('sales')}</dt>
            <dd>{f.money(r.totals.salesMinor)}</dd>
          </div>
        </div>
        {r.totals.givenFreeMinor > 0 ? (
          <div className="fc2-stat is-free">
            <span className="fc2-stat-icon" aria-hidden="true">
              <IconReceipt />
            </span>
            <div>
              <dt>{tc('givenFree')}</dt>
              <dd>{f.money(r.totals.givenFreeMinor)}</dd>
            </div>
          </div>
        ) : null}
      </dl>

      {attention.length > 0 ? (
        <section className="fc2-attention" aria-labelledby="fc2-attention-h">
          <h2 id="fc2-attention-h" className="fc2-h">
            {tc('attention')}
          </h2>
          <ul>
            {attention.map((a) => (
              <li key={a.key}>
                <span className="fc2-att-text">{a.text}</span>
                {a.detail ? <span className="fc2-att-detail">{a.detail}</span> : null}
                {a.action ?? null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="fc2-detail">
        <div className="fc2-tabs" role="tablist" aria-label={tc('tabsLabel')}>
          {tabs.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              id={`fc2-tab-${x.key}`}
              aria-selected={tab === x.key}
              aria-controls="fc2-panel"
              className={`fc2-tab ${tab === x.key ? 'is-on' : ''}`}
              onClick={() => setTab(x.key)}
            >
              {x.label}
              {typeof x.n === 'number' && x.n > 0 ? <span className="fc2-tab-n">{x.n}</span> : null}
            </button>
          ))}
        </div>

        <div className="fc2-panel" id="fc2-panel" role="tabpanel" aria-labelledby={`fc2-tab-${tab}`}>
          {tab === 'dishes' ? (
            r.costliest.length === 0 ? (
              <p className="fc2-empty">{tc('noDishes')}</p>
            ) : (
              <table className="fc2-table">
                <thead>
                  <tr>
                    <th>{td('cols.dish')}</th>
                    <th className="fc2-num fc2-wide">{td('cols.sold')}</th>
                    <th className="fc2-num fc2-wide">{td('cols.sales')}</th>
                    <th className="fc2-num fc2-wide">{td('cols.food')}</th>
                    <th className="fc2-num">{tc('cols.perHundred')}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.costliest.map((d) => (
                    <tr key={d.name}>
                      <td>
                        <span className="fc2-name">{d.name}</span>
                        <span className="fc2-sub">{t('dishLine', { qty: f.count(d.qty), sales: f.money(d.salesMinor), food: f.money(d.foodMinor) })}</span>
                      </td>
                      <td className="fc2-num fc2-wide">{f.count(d.qty)}</td>
                      <td className="fc2-num fc2-wide">{f.money(d.salesMinor)}</td>
                      <td className="fc2-num fc2-wide">{f.money(d.foodMinor)}</td>
                      <td className="fc2-num">{pill(d.foodCostPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}

          {tab === 'days' ? (
            sellingDays.length === 0 ? (
              <p className="fc2-empty">{t('noSalesDay')}</p>
            ) : (
              <>
                <table className="fc2-table">
                  <thead>
                    <tr>
                      <th>{td('cols.day')}</th>
                      <th className="fc2-num fc2-wide">{td('cols.sales')}</th>
                      <th className="fc2-num fc2-wide">{td('cols.food')}</th>
                      <th className="fc2-num">{tc('cols.perHundred')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellingDays.map((d) => (
                      <tr key={d.dateISO}>
                        <td>
                          <span className="fc2-name">{f.day(d.dateISO)}</span>
                          <span className="fc2-sub">{t('dayLine', { sales: f.money(d.salesMinor), food: f.money(d.foodMinor) })}</span>
                        </td>
                        <td className="fc2-num fc2-wide">{f.money(d.salesMinor)}</td>
                        <td className="fc2-num fc2-wide">{f.money(d.foodMinor)}</td>
                        <td className="fc2-num">{pill(d.foodCostPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {quietDays > 0 ? <p className="fc2-foot">{td('quietDays', { count: quietDays })}</p> : null}
              </>
            )
          ) : null}

          {tab === 'ingredients' ? (
            used.length === 0 ? (
              <p className="fc2-empty">{t('noUsed')}</p>
            ) : (
              <>
                <table className="fc2-table">
                  <thead>
                    <tr>
                      <th>{td('cols.item')}</th>
                      <th className="fc2-num">{td('cols.qty')}</th>
                      <th className="fc2-num">{tc('cols.cost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {used.map((u) => (
                      <tr key={u.materialId}>
                        <td>
                          <span className="fc2-name">{u.name}</span>
                        </td>
                        <td className="fc2-num">{qty(u.qty, u.unit)}</td>
                        <td className="fc2-num fc2-money">{f.money(u.valueMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="fc2-foot">{used.some((u) => u.unpriced) ? `${tc('usedNote')} ${t('usedUnpriced')}` : tc('usedNote')}</p>
              </>
            )
          ) : null}

          {tab === 'waste' ? (
            loss.byItem.length === 0 ? (
              <p className="fc2-empty">{t('noLoss')}</p>
            ) : (
              <>
                <table className="fc2-table">
                  <thead>
                    <tr>
                      <th>{td('cols.item')}</th>
                      <th className="fc2-num fc2-wide">{tc('cols.thrown')}</th>
                      <th className="fc2-num fc2-wide">{td('cols.missing')}</th>
                      {loss.totals.foundMinor > 0 ? <th className="fc2-num fc2-wide">{tc('cols.foundExtra')}</th> : null}
                      <th className="fc2-num">{tc('cols.cost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loss.byItem.map((i) => (
                      <tr key={i.materialId}>
                        <td>
                          <span className="fc2-name">{i.name}</span>
                          <span className="fc2-sub">
                            {[
                              i.wastedQty > 0 ? t('itemWasted', { qty: qty(i.wastedQty, i.unit) }) : null,
                              i.lostQty > 0 ? t('itemLost', { qty: qty(i.lostQty, i.unit) }) : null,
                              i.foundQty > 0 ? t('itemFound', { qty: qty(i.foundQty, i.unit) }) : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </td>
                        <td className="fc2-num fc2-wide">{i.wastedQty > 0 ? qty(i.wastedQty, i.unit) : '—'}</td>
                        <td className="fc2-num fc2-wide">{i.lostQty > 0 ? qty(i.lostQty, i.unit) : '—'}</td>
                        {loss.totals.foundMinor > 0 ? <td className="fc2-num fc2-wide">{i.foundQty > 0 ? qty(i.foundQty, i.unit) : '—'}</td> : null}
                        <td className="fc2-num fc2-money">{f.money(i.wastedMinor + i.lostMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="fc2-foot">{tc('lossNote')}</p>
              </>
            )
          ) : null}

          {tab === 'log' ? (
            loss.entries.length === 0 ? (
              <p className="fc2-empty">{t('noLoss')}</p>
            ) : (
              <>
                <table className="fc2-table">
                  <thead>
                    <tr>
                      <th>{td('cols.item')}</th>
                      <th className="fc2-wide">{td('cols.when')}</th>
                      <th className="fc2-wide">{td('cols.why')}</th>
                      {people > 1 ? <th className="fc2-wide">{td('cols.by')}</th> : null}
                      <th className="fc2-num fc2-wide">{td('cols.qty')}</th>
                      <th className="fc2-num">{tc('cols.cost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loss.entries.map((e, n) => {
                      const why = [e.reason ? t(`reason.${e.reason}`) : null, e.dish, e.note].filter(Boolean).join(' · ');
                      return (
                        <tr key={`${e.atISO}-${n}`}>
                          <td>
                            <span className="fc2-name">
                              {e.name} <span className={`fc2-kind is-${e.kind}`}>{t(`kind.${e.kind}`)}</span>
                            </span>
                            <span className="fc2-sub">{[qty(e.qty, e.unit), f.when(e.atISO, timezone), why || null].filter(Boolean).join(' · ')}</span>
                          </td>
                          <td className="fc2-wide fc2-muted">{f.when(e.atISO, timezone)}</td>
                          <td className="fc2-wide fc2-muted">{why || '—'}</td>
                          {people > 1 ? <td className="fc2-wide fc2-muted">{e.by ?? '—'}</td> : null}
                          <td className="fc2-num fc2-wide">{qty(e.qty, e.unit)}</td>
                          <td className="fc2-num fc2-money">{e.valueMinor === null ? t('noPriceShort') : f.money(e.valueMinor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {loss.moreEntries > 0 ? <p className="fc2-foot">{t('moreEntries', { count: loss.moreEntries })}</p> : null}
              </>
            )
          ) : null}
        </div>
      </section>
    </div>
  );
}

/** ⓘ — the explanation, on request. A disclosure, so it works by keyboard and a screen reader says it opens. */
function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="fc2-info">
      <summary aria-label={label} title={label}>
        i
      </summary>
      <div className="fc2-info-body">{children}</div>
    </details>
  );
}

/** One control for the period: the four asked for most, then Custom… with the two dates inside. */
export function PeriodMenu({ report, f }: { report: Pick<Report, 'dates' | 'onDates' | 'todayISO'>; f: Fmt }) {
  const t = useTranslations('moneyReports');
  const tc = useTranslations('moneyReports.foodCost.clean');
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const panel = useAnchoredPanel(open, close);
  const current: ReportPreset | null =
    REPORT_PRESETS.find((k) => {
      const r = presetRange(k, report.todayISO);
      return r.fromISO === report.dates.fromISO && r.toISO === report.dates.toISO;
    }) ?? null;
  const label = current ? t(`presets.${current}`) : `${f.day(report.dates.fromISO)} – ${f.day(report.dates.toISO)}`;
  return (
    <div className="dropdown-anchor fc2-period" ref={open ? panel.anchorRef : undefined}>
      <button type="button" className="fc2-period-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{label}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="dropdown-panel dropdown-panel-right fc2-period-panel" aria-label={t('rangeLabel')} ref={panel.panelRef} style={panel.style}>
          {REPORT_PRESETS.map((k) => (
            <button
              key={k}
              type="button"
              className={`dropdown-item dropdown-item-plain ${current === k && !custom ? 'is-on' : ''}`}
              aria-pressed={current === k}
              onClick={() => {
                const r = presetRange(k, report.todayISO);
                report.onDates(r.fromISO, r.toISO, 'to');
                setCustom(false);
                setOpen(false);
              }}
            >
              {t(`presets.${k}`)}
            </button>
          ))}
          <span className="dropdown-sep" />
          <button type="button" className={`dropdown-item dropdown-item-plain ${custom || !current ? 'is-on' : ''}`} aria-expanded={custom} onClick={() => setCustom((v) => !v)}>
            {tc('custom')}
          </button>
          {custom || !current ? (
            <div className="fc2-period-dates">
              <label>
                <span>{t('from')}</span>
                <input type="date" value={report.dates.fromISO} max={report.todayISO} onChange={(e) => report.onDates(e.target.value, report.dates.toISO, 'from')} />
              </label>
              <label>
                <span>{t('to')}</span>
                <input type="date" value={report.dates.toISO} max={report.todayISO} onChange={(e) => report.onDates(report.dates.fromISO, e.target.value, 'to')} />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
