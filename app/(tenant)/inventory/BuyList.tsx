'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, formatMoney } from '../lib/api';
import type { BuyItem, BuyList as BuyListData } from '../lib/api-types';
import { amount, shownAmount, unitWord } from '../lib/kitchen-units';
import { groupBySupplier } from './buy-list';
import { BuyShareSheet } from './BuyShareSheet';

/**
 * Jira GRW-739 — Kitchen stock's "To buy": every item at or below its low-stock level, furthest below first, grouped by who it was last
 * bought from, with how much is left, the level, and a starting figure to buy (twice the level). The owner and a manager also see the last
 * price; the cook and the counter are sent none (the API leaves it out). Share opens a sheet to change the figures and send the list on
 * WhatsApp — a link in the owner's own WhatsApp, nothing sent by itself.
 */
/**
 * Develop QA 2026-11-18, bug 5 — `noItems`: the kitchen has no items at all yet. "Everything is above its low-stock level" is then
 * untrue (there is nothing to be above anything), so the list says what to do first.
 */
export function BuyList({ branchId, noItems = false }: { branchId: string; noItems?: boolean }) {
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
  if (data.items.length === 0) return <p className="ks-state">{noItems ? t('noItems') : t('empty')}</p>;

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
                      {/* Jira GRW-743 FR-05 — never "−0.34 L left": none, and by how much more was used than recorded. */}
                      {i.stock < 0
                        ? t('leftNone', { over: shownAmount(-i.stock, i.unit), unit: unitWord(i.unit), low: shownAmount(i.lowStockAt, i.unit) })
                        : t('left', { amount: shownAmount(i.stock, i.unit), unit: unitWord(i.unit), low: shownAmount(i.lowStockAt, i.unit) })}
                    </span>
                    {/* QA 2026-11-19, problem 3 — why the amount is what it is: this week's use. */}
                    {i.usedPerDay ? <span className="ks-meta">{t('usesADay', { amount: shownAmount(i.usedPerDay, i.unit), unit: unitWord(i.unit) })}</span> : null}
                    {p ? <span className="ks-meta">{p}</span> : null}
                  </span>
                  <span className={`ks-amount ${i.stock < 0 ? 'is-below' : 'is-low'}`}>
                    {i.packSize && i.packLabel && i.suggestQty % i.packSize === 0
                      ? t('buyPacks', { n: i.suggestQty / i.packSize, label: i.packLabel, amount: shownAmount(i.suggestQty, i.unit), unit: unitWord(i.unit) })
                      : t('buy', { amount: shownAmount(i.suggestQty, i.unit), unit: unitWord(i.unit) })}
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
