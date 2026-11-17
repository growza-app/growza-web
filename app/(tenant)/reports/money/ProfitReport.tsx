'use client';

import { useTranslations } from 'next-intl';
import { api } from '../../lib/api';
import type { ProfitReportPage } from '../../lib/api-types';
import { MoneyEmpty, MoneyShell, useMoneyFormat, useMoneyReport } from './MoneyShell';

/**
 * Owner, 2026-11-14 — which items make money, not only which sell.
 *
 * One figure first (profit, and what share of sales it is), then the three it is made of, then every item best profit
 * first. An item with no cost price is SAID — "No cost price" — and kept out of the profit, never valued at zero, and
 * the screen asks for the missing prices in a line rather than hiding the gap. Laid out at 344px: cards, no table.
 */
export function ProfitReport() {
  const t = useTranslations('moneyReports');
  const p = useTranslations('moneyReports.profit');
  const f = useMoneyFormat();
  const report = useMoneyReport<ProfitReportPage>(api.profitReport);

  return (
    <MoneyShell report={report}>
      {(r) =>
        !r.anySales ? (
          <MoneyEmpty text={t('nothing')} />
        ) : (
          <>
            <section className="srp-totals srp-kpi-grid" aria-label={p('title')}>
              {r.totals.costedSalesMinor === 0 && r.totals.costMinor === 0 ? (
                <div className="srp-kpi-card is-warn">
                  <p className="srp-worth-label">{p('profitLabel')}</p>
                  <p className="srp-worth">{p('noCostAtAll')}</p>
                  <p className="srp-hint">{p('noCostAtAllHint')}</p>
                </div>
              ) : (
                <div className="srp-kpi-card is-primary">
                  <p className="srp-worth-label">{p('profitLabel')}</p>
                  <p className={`srp-worth ${r.totals.profitMinor < 0 ? 'mr-loss' : ''}`}>{f.money(r.totals.profitMinor)}</p>
                  {r.totals.marginPct !== null ? <p className="srp-hint">{p('marginLine', { margin: r.totals.marginPct })}</p> : null}
                </div>
              )}
              <div className="srp-kpi-card">
                <p className="srp-worth-label">{p('salesLabel')}</p>
                <p className="srp-kpi-num">{f.money(r.totals.salesMinor)}</p>
              </div>
              <div className="srp-kpi-card">
                <p className="srp-worth-label">{p('costLabel')}</p>
                <p className="srp-kpi-num">{f.money(r.totals.costMinor)}</p>
              </div>
              {r.totals.commissionMinor > 0 ? (
                <div className="srp-kpi-card">
                  <p className="srp-worth-label">{p('commissionLabel')}</p>
                  <p className="srp-kpi-num">{f.money(r.totals.commissionMinor)}</p>
                </div>
              ) : null}
            </section>

            {r.totals.uncostedItems > 0 ? <p className="srp-warn">{p('uncosted', { count: r.totals.uncostedItems, value: f.money(r.totals.uncostedSalesMinor) })}</p> : null}
            {/* Jira GRW-724 — service charge: income of its own, never in a dish's sales or profit. */}
            {(r.totals.serviceChargeMinor ?? 0) > 0 ? <p className="srp-hint">{p('serviceCharge', { value: f.money(r.totals.serviceChargeMinor!) })}</p> : null}
            <p className="srp-hint">{p('costNote')}</p>

            <h2 className="mr-title">{p('listTitle')}</h2>
            <ul className="srp-list">
              {r.rows.map((row) => (
                <li key={row.id} className="srp-card">
                  <div className="srp-head">
                    <h3 className="srp-name">{row.name}</h3>
                    <p className={`srp-value ${row.profitMinor !== null && row.profitMinor < 0 ? 'mr-loss' : ''}`}>
                      {row.profitMinor === null ? p('noCost') : row.profitMinor < 0 ? p('loss', { loss: f.money(-row.profitMinor) }) : f.money(row.profitMinor)}
                    </p>
                  </div>
                  <p className="srp-hint">
                    {p('sold', { qty: f.count(row.qty), sales: f.money(row.salesMinor) })}
                    {row.marginPct !== null && row.profitMinor !== null && row.profitMinor >= 0 ? ` · ${row.marginPct}%` : ''}
                  </p>
                  {row.partlyCosted ? <p className="srp-hint">{p('partly')}</p> : null}
                </li>
              ))}
            </ul>
            {r.moreRows > 0 ? <p className="srp-hint">{p('more', { count: r.moreRows })}</p> : null}
          </>
        )
      }
    </MoneyShell>
  );
}
