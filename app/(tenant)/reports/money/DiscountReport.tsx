'use client';

import { useTranslations } from 'next-intl';
import AppLink from '../../../shared/AppLink';
import { api } from '../../lib/api';
import type { DiscountReportPage } from '../../lib/api-types';
import { useMayOpen } from '../../components/SessionProvider';
import { MoneyEmpty, MoneyShell, useMoneyFormat, useMoneyReport } from './MoneyShell';

/**
 * Owner, 2026-11-14 — what went out below its price: the comp, the staff meal, the regular's ₹40 off.
 *
 * The total is the day report's "given away" over a period, so the two agree to the paisa on any one day. Then the
 * days it happened on (only those: a week of "₹0" lines is noise), the biggest bills — each opens its order — and
 * what was given free, by item.
 */
export function DiscountReport() {
  const t = useTranslations('moneyReports');
  const d = useTranslations('moneyReports.discounts');
  const f = useMoneyFormat();
  const mayOpen = useMayOpen();
  const report = useMoneyReport<DiscountReportPage>(api.discountReport);
  const ordersOpen = mayOpen('/orders');

  return (
    <MoneyShell report={report}>
      {(r) =>
        r.totals.bills === 0 ? (
          <MoneyEmpty text={r.totals.allBills === 0 ? t('nothing') : d('none')} />
        ) : (
          <>
            <section className="srp-totals srp-kpi-grid" aria-label={d('title')}>
              <div className="srp-kpi-card is-warn">
                <p className="srp-worth-label">{d('belowLabel')}</p>
                <p className="srp-worth">{f.money(r.totals.belowMinor)}</p>
                <p className="srp-hint">{d('billsLine', { bills: f.count(r.totals.bills), all: f.count(r.totals.allBills) })}</p>
              </div>
              <div className="srp-kpi-card">
                <p className="srp-worth-label">{d('freeBillsLabel')}</p>
                <p className="srp-kpi-num">{f.count(r.totals.freeBills)}</p>
                <p className="srp-hint">{d('freeBillsLine')}</p>
              </div>
            </section>

            <h2 className="mr-title">{d('byDayTitle')}</h2>
            <ul className="srp-list">
              {r.byDay
                .filter((x) => x.bills > 0)
                .reverse()
                .map((x) => (
                  <li key={x.dateISO} className="srp-card">
                    <div className="srp-head">
                      <h3 className="srp-name">{f.day(x.dateISO)}</h3>
                      <p className="srp-value">{d('dayLine', { value: f.money(x.belowMinor), bills: x.bills })}</p>
                    </div>
                  </li>
                ))}
            </ul>

            <h2 className="mr-title">{d('billsTitle')}</h2>
            <ul className="srp-list">
              {r.bills.map((b) => (
                <li key={b.id} className="srp-card">
                  <div className="srp-head">
                    <h3 className="srp-name">
                      {b.tokenNo !== null ? `${t('token', { n: b.tokenNo })} · ` : ''}
                      {f.when(b.soldAtISO, report.timezone)}
                    </h3>
                    <p className="srp-value">{b.free ? d('freeTag') : `−${f.money(b.belowMinor)}`}</p>
                  </div>
                  <p className="srp-hint">{d('billLine', { list: f.money(b.listMinor), charged: f.money(b.chargedMinor) })}</p>
                  {/* Jira GRW-725 — why the owner gave it free, as the bill keeps it. */}
                  {b.reason ? <p className="srp-hint">{d('reasonLine', { reason: b.reason })}</p> : null}
                  {ordersOpen ? (
                    <AppLink className="mr-link" href={`/orders/${b.id}`}>
                      {t('openOrder')}
                    </AppLink>
                  ) : null}
                </li>
              ))}
            </ul>

            {r.freeItems.length > 0 ? (
              <>
                <h2 className="mr-title">{d('freeItemsTitle')}</h2>
                <ul className="srp-list">
                  {r.freeItems.map((i) => (
                    <li key={i.name} className="srp-card">
                      <div className="srp-head">
                        <h3 className="srp-name">{i.name}</h3>
                        <p className="srp-value">{d('freeItemLine', { qty: f.count(i.qty), value: f.money(i.listMinor) })}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {r.takenOff && r.takenOff.items.length > 0 ? (
              <>
                <h2 className="mr-title">{d('takenOffTitle', { value: f.money(r.takenOff.totalMinor) })}</h2>
                <p className="field-hint">{d('takenOffHint')}</p>
                <ul className="srp-list">
                  {r.takenOff.items.map((i) => (
                    <li key={i.name} className="srp-card">
                      <div className="srp-head">
                        <h3 className="srp-name">{i.name}</h3>
                        <p className="srp-value">{d('freeItemLine', { qty: f.count(i.qty), value: f.money(i.listMinor) })}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )
      }
    </MoneyShell>
  );
}
