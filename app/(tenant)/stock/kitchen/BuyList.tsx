'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, formatMoney } from '../../lib/api';
import type { BuyItem, BuyList as BuyListData } from '../../lib/api-types';
import { amount, unitWord } from '../../lib/kitchen-units';
import { groupBySupplier } from './buy-list';
import { BuyShareSheet } from './BuyShareSheet';

/**
 * Jira GRW-739 — Kitchen stock's "To buy": every item at or below its low-stock level, furthest below first, grouped by who it was last
 * bought from, with how much is left, the level, and a starting figure to buy (twice the level). The owner and a manager also see the last
 * price; the cook and the counter are sent none (the API leaves it out). Share opens a sheet to change the figures and send the list on
 * WhatsApp — a link in the owner's own WhatsApp, nothing sent by itself.
 */
export function BuyList({ branchId }: { branchId: string }) {
  const t = useTranslations('kitchenStock.toBuy');
  const locale = useLocale();
  const [data, setData] = useState<BuyListData | null>(null);
  const [failed, setFailed] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    setData(null);
    try {
      setData(await api.stockReorder(branchId));
    } catch {
      setFailed(true);
    }
  }, [branchId]);
  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupBySupplier(data?.items ?? []), [data]);

  if (failed) {
    return (
      <div role="alert" className="ks-state ks-state-error">
        <p>{t('loadFailed')}</p>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          {t('retry')}
        </button>
      </div>
    );
  }
  if (data === null) {
    return (
      <ul className="ks-list" aria-busy="true" aria-label={t('loading')}>
        {[0, 1, 2].map((i) => (
          <li key={i} className="ks-row ks-skel" aria-hidden="true" />
        ))}
      </ul>
    );
  }
  if (data.items.length === 0) return <p className="ks-state">{t('empty')}</p>;

  const price = (i: BuyItem): string | null => {
    if (typeof i.lastPriceMinor !== 'number') return null;
    const per = i.lastPricePackSize && i.lastPricePackSize !== 1000 ? `${amount(i.lastPricePackSize)} ${unitWord(i.unit)}` : unitWord(i.unit);
    return t('lastPrice', { price: formatMoney(i.lastPriceMinor, 'INR', locale), per });
  };

  return (
    <>
      {groups.map((g) => (
        <section key={g.supplierId ?? 'none'} className="kb-group" aria-label={g.name ?? t('noSupplier')}>
          <h3 className="kb-supplier">
            {g.name ?? t('noSupplier')}
            {g.phone ? <span className="ks-meta"> · {g.phone}</span> : null}
          </h3>
          <ul className="ks-list">
            {g.items.map((i) => {
              const p = price(i);
              return (
                <li key={i.materialId} className="ks-row kb-row">
                  <span className="ks-name">
                    {i.name}
                    <span className="ks-meta">
                      {t('left', { amount: amount(i.stock), unit: unitWord(i.unit), low: amount(i.lowStockAt) })}
                    </span>
                    {p ? <span className="ks-meta">{p}</span> : null}
                  </span>
                  <span className={`ks-amount ${i.stock < 0 ? 'is-below' : 'is-low'}`}>
                    {t('buy', { amount: amount(i.suggestQty), unit: unitWord(i.unit) })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="ks-hint">{t('hint')}</p>
      <button type="button" className="btn kb-share" onClick={() => setSharing(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15V4m0 0L8 8m4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
        </svg>
        {t('share')}
      </button>
      {sharing ? <BuyShareSheet list={data} groups={groups} onClose={() => setSharing(false)} /> : null}
    </>
  );
}
