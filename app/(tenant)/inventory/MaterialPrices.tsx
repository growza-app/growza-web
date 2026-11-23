'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api, formatMoney } from '../lib/api';
import type { MaterialUnit, PriceTrend } from '../lib/api-types';
import { intlLocale } from '../lib/format';
import { amount, unitWord } from '../lib/kitchen-units';

/**
 * Jira GRW-739 FR-07 — what an item has been costing: its last five priced stock ins, newest first, with the supplier and the day, and the
 * price per kg (or L, or piece) beside a pack's price so two packs can be compared. Prices before GST. Shown only to whoever sees the money
 * (the sheet draws it where the API sent an average cost); the API refuses anyone else.
 */
export function MaterialPrices({ materialId, unit }: { materialId: string; unit: MaterialUnit }) {
  const t = useTranslations('kitchenStock.prices');
  const locale = useLocale();
  const [trend, setTrend] = useState<PriceTrend | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .materialPrices(materialId)
      .then((r) => live && setTrend(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [materialId]);

  const money = (minor: number) => formatMoney(minor, 'INR', locale);
  const day = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const points = trend?.points ?? [];
  // Up or down from the stock in before it (the list is newest first), so the owner sees a rise at a glance.
  const change = (i: number): 'up' | 'down' | null => {
    const prev = points[i + 1];
    if (!prev) return null;
    const now = Math.round(points[i]!.unitCost);
    const then = Math.round(prev.unitCost);
    return now > then ? 'up' : now < then ? 'down' : null;
  };

  return (
    <section className="ks-history" aria-labelledby={`ks-prices-${materialId}`}>
      <h3 id={`ks-prices-${materialId}`} className="prd-field-label">
        {t('title')}
      </h3>
      {failed ? (
        <p className="ks-hint">{t('loadFailed')}</p>
      ) : trend === null ? (
        <p className="ks-hint">{t('loading')}</p>
      ) : points.length === 0 ? (
        <p className="ks-hint">{t('empty')}</p>
      ) : (
        <ul className="ks-history-list">
          {points.map((p, i) => {
            const dir = change(i);
            return (
              <li key={`${p.boughtOn}-${i}`} className="ks-history-row">
                <span className="ks-name">
                  <span>{p.supplierName ?? t('noSupplier')}</span>
                  <span className="ks-meta">
                    {day(p.boughtOn)}
                    {p.packSize !== 1000 ? ` · ${t('pack', { price: money(p.priceMinor), size: amount(p.packSize), unit: unitWord(unit) })}` : ''}
                  </span>
                </span>
                <span className={`ks-amount ${dir === 'up' ? 'is-below' : ''}`}>
                  {t('perUnit', { price: money(Math.round(p.unitCost)), unit: unitWord(unit) })}
                  {dir ? <span className="ks-meta">{t(dir)}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
