'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '../../lib/api';
import type { ReturnsReportPage, SellersRange } from '../../lib/api-types';
import { intlLocale } from '../../lib/format';
import { returnReasonKey } from '../../lib/return-reasons';
import AppLink from '../../../shared/AppLink';
import { useBranch } from '../../components/BranchProvider';
import { useSession } from '../../components/SessionProvider';

const RANGES: readonly SellersRange[] = ['last_3_months', 'last_7_days', 'this_month', 'last_month', 'this_year'];

/**
 * Jira GRW-635 — what came back, and why.
 *
 * Customer returns grouped by the reason they were given, the most first, so "size didn't fit — 18" is one number at a glance. A parcel that came
 * back UNDELIVERED is its own card, never inside the customer returns: it is a courier problem, not a returns problem, and lumping the two would
 * hide one behind the other. A return with no reason (the counter does not ask) is "no reason given", counted and not dropped. The words are
 * plain: nothing here is called by the trade's short name for an undelivered parcel.
 */
export function ReturnsClient() {
  const t = useTranslations('orders.returns');
  const tr = useTranslations('orders.returnReasons');
  const locale = useLocale();
  const session = useSession();
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;
  const [range, setRange] = useState<SellersRange>('last_3_months');
  const [data, setData] = useState<ReturnsReportPage | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const count = (n: number) => new Intl.NumberFormat(intlLocale(locale)).format(n);

  const load = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    setFailed(false);
    try {
      const res = await api.returnsReport({ range, location: branch || undefined });
      if (mine === seq.current) setData(res);
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  }, [ready, range, branch]);
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  return (
    <div className="srp srp-returns">
      <div className="srp-toolbar">
        <select className="input srp-select" aria-label={t('rangeLabel')} value={range} onChange={(e) => setRange(e.target.value as SellersRange)}>
          {RANGES.map((r) => (
            <option key={r} value={r}>
              {t(`range.${r}`)}
            </option>
          ))}
        </select>
      </div>

      {failed ? (
        <div className="ord-state" role="alert">
          <p>{t('loadError')}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      ) : data === null ? (
        <ul className="srp-list" aria-busy="true" aria-label={t('loading')}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="srp-card srp-skeleton" />
          ))}
        </ul>
      ) : !data.anyReturns ? (
        <div className="srp-empty" role="status">
          <p className="srp-empty-title">{t('nothing')}</p>
          <p className="srp-hint">{t('nothingHint')}</p>
        </div>
      ) : (
        <>
          <section className="srp-totals" aria-label={t('customerTitle')}>
            <p className="srp-worth-label">{t('customerTitle')}</p>
            <p className="srp-worth">{t('returnsCount', { count: data.customer.returns })}</p>
            <p className="srp-hint">{t('unitsCount', { count: data.customer.units })}</p>
          </section>

          {data.byReason.length > 0 ? (
            <ul className="srp-list">
              {data.byReason.map((b) => (
                <li key={b.reason} className="srp-card">
                  <div className="srp-head">
                    <h2 className="srp-name">{tr(returnReasonKey(b.reason))}</h2>
                    <p className="srp-value">{count(b.returns)}</p>
                  </div>
                  <p className="srp-hint">{t('unitsCount', { count: b.units })}</p>
                </li>
              ))}
            </ul>
          ) : null}

          <section className="srp-totals" aria-label={t('undeliveredTitle')}>
            <p className="srp-worth-label">{t('undeliveredTitle')}</p>
            <p className="srp-worth">{t('returnsCount', { count: data.undelivered.returns })}</p>
            <p className="srp-hint">{data.undelivered.returns > 0 ? t('unitsCount', { count: data.undelivered.units }) : t('undeliveredNone')}</p>
            <p className="srp-hint">{t('undeliveredNote')}</p>
          </section>
        </>
      )}
      <div className="srp-links">
        <AppLink className="btn btn-ghost srp-export" href="/orders/refunds">
          {t('toRefunds')}
        </AppLink>
      </div>
    </div>
  );
}
