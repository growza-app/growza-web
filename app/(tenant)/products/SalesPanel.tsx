'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api, formatMoney } from '../lib/api';
import type { Product, ProductSales } from '../lib/api-types';
import { intlLocale } from '../lib/format';

/** Owner, 2026-10-14 — the Sales part of the product sheet: the last 30 days, two numbers and a day-by-day list. */
export function SalesPanel({ product }: { product: Product }) {
  const t = useTranslations('products.sales');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [sales, setSales] = useState<ProductSales | null>(null);
  useEffect(() => {
    let live = true;
    api
      .productSales(product.id)
      .then((s) => live && setSales(s))
      .catch(() => live && setSales({ days: 30, qty: 0, moneyMinor: 0, byDay: [] }));
    return () => {
      live = false;
    };
  }, [product.id]);
  const day = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', day: 'numeric', month: 'short' });
  const margin = product.costMinor != null && sales ? sales.moneyMinor - sales.qty * Number(product.costMinor) : null;

  return (
    <div className="sheet-body prd-sales">
      {sales === null ? (
        <div className="sheet-foot">{tc('loading')}</div>
      ) : (
        <>
          <div className="prd-sales-strip">
            <div className="prd-stat">
              <span className="prd-stat-n">{sales.qty}</span>
              <span className="prd-stat-l">{t('sold', { days: sales.days })}</span>
            </div>
            <div className="prd-stat">
              <span className="prd-stat-n">{formatMoney(sales.moneyMinor)}</span>
              <span className="prd-stat-l">{t('money')}</span>
            </div>
            {margin !== null ? (
              <div className="prd-stat">
                <span className={`prd-stat-n ${margin < 0 ? 'prd-margin-neg' : ''}`}>{formatMoney(margin)}</span>
                <span className="prd-stat-l">{t('margin')}</span>
              </div>
            ) : null}
          </div>
          <p className="sheet-foot">{t('allTime', { n: product.sold })}</p>
          {sales.byDay.length === 0 ? (
            <div className="sheet-foot">{t('none')}</div>
          ) : (
            <ul className="prd-ledger">
              {sales.byDay.map((d) => (
                <li key={d.day} className="prd-ledger-row prd-sales-row">
                  <span className="prd-ledger-qty prd-ledger-in">{d.qty}</span>
                  <span className="prd-ledger-what">{day.format(new Date(`${d.day}T12:00:00`))}</span>
                  <span className="prd-ledger-after">{formatMoney(d.moneyMinor)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
