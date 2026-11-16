'use client';

import { useTranslations } from 'next-intl';
import AppLink from '../../../shared/AppLink';
import { api } from '../../lib/api';
import type { MoneyPaymentMode, PaymentsReportPage } from '../../lib/api-types';
import { useMayOpen } from '../../components/SessionProvider';
import { MoneyEmpty, MoneyShell, useMoneyFormat, useMoneyReport } from './MoneyShell';

const ORDER: readonly MoneyPaymentMode[] = ['cash', 'upi', 'card', 'other', 'not_recorded'];

/**
 * Owner, 2026-11-14 — how the counter's money came in: by way (what the drawer and the UPI account should show), by day,
 * less what was handed back, and the orders still waiting to be paid. Counter bills only, and the screen says so: a
 * delivery app pays the business separately, later, and that is Sales by channel.
 */
export function PaymentsReport() {
  const t = useTranslations('moneyReports');
  const p = useTranslations('moneyReports.payments');
  const f = useMoneyFormat();
  const mayOpen = useMayOpen();
  const report = useMoneyReport<PaymentsReportPage>(api.paymentsReport);
  const ordersOpen = mayOpen('/orders');

  return (
    <MoneyShell report={report}>
      {(r) => (
        <>
          {r.modes.length === 0 ? (
            <MoneyEmpty text={p('none')} />
          ) : (
            <>
              <section className="srp-totals srp-kpi-grid" aria-label={p('title')}>
                <div className="srp-kpi-card is-primary">
                  <p className="srp-worth-label">{p('netLabel')}</p>
                  <p className="srp-worth">{f.money(r.totals.netMinor)}</p>
                  <p className="srp-hint">{p('netLine', { received: f.money(r.totals.receivedMinor), refunded: f.money(r.totals.refundedMinor) })}</p>
                </div>
                {r.modes.map((m) => (
                  <div key={m.mode} className="srp-kpi-card">
                    <p className="srp-worth-label">{p(`mode.${m.mode}`)}</p>
                    <p className="srp-kpi-num">{f.money(m.netMinor)}</p>
                    {m.refundedMinor > 0 ? <p className="srp-hint">{p('modeLine', { received: f.money(m.receivedMinor), refunded: f.money(m.refundedMinor) })}</p> : null}
                  </div>
                ))}
              </section>
              <p className="srp-hint">{p('counterOnly')}</p>

              <h2 className="mr-title">{p('byDayTitle')}</h2>
              <ul className="srp-list">
                {[...r.byDay].reverse().map((x) => {
                  const ways = ORDER.filter((m) => (x.received[m] ?? 0) !== 0);
                  return (
                    <li key={x.dateISO} className="srp-card">
                      <div className="srp-head">
                        <h3 className="srp-name">{f.day(x.dateISO)}</h3>
                        <p className="srp-value">{ways.length === 0 && x.refundedMinor === 0 ? p('noTrade') : f.money(x.netMinor)}</p>
                      </div>
                      {ways.length > 0 || x.refundedMinor > 0 ? (
                        <p className="srp-hint">
                          {[
                            ...ways.map((m) => `${p(`mode.${m}`)} ${f.money(x.received[m] ?? 0)}`),
                            ...(x.refundedMinor > 0 ? [p('dayRefund', { value: f.money(x.refundedMinor) })] : []),
                          ].join(' · ')}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              {/* Jira GRW-723 BR-03 — who took the money: a waiter's payments under their name. */}
              {r.byPerson && r.byPerson.length > 0 ? (
                <>
                  <h2 className="mr-title">{p('byPersonTitle')}</h2>
                  <ul className="srp-list">
                    {r.byPerson.map((x) => {
                      const ways = ORDER.filter((m) => (x.modes[m] ?? 0) !== 0);
                      return (
                        <li key={x.name ?? '-'} className="srp-card">
                          <div className="srp-head">
                            <h3 className="srp-name">{x.name ?? p('byPersonUnknown')}</h3>
                            <p className="srp-value">{f.money(x.receivedMinor)}</p>
                          </div>
                          <p className="srp-hint">{ways.map((m) => `${p(`mode.${m}`)} ${f.money(x.modes[m] ?? 0)}`).join(' · ')}</p>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </>
          )}

          <h2 className="mr-title">{p('pendingTitle')}</h2>
          {r.pending.count === 0 ? (
            <p className="srp-hint">{p('pendingNone')}</p>
          ) : (
            <>
              <p className="srp-warn">{p('pendingLine', { count: r.pending.count, value: f.money(r.pending.valueMinor) })}</p>
              <ul className="srp-list">
                {r.pending.rows.map((o) => (
                  <li key={o.id} className="srp-card">
                    <div className="srp-head">
                      <h3 className="srp-name">
                        {o.tokenNo !== null ? `${t('token', { n: o.tokenNo })} · ` : ''}
                        {f.when(o.soldAtISO, report.timezone)}
                      </h3>
                      <p className="srp-value">{f.money(o.valueMinor)}</p>
                    </div>
                    {ordersOpen ? (
                      <AppLink className="mr-link" href={`/orders/${o.id}`}>
                        {t('openOrder')}
                      </AppLink>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </MoneyShell>
  );
}
