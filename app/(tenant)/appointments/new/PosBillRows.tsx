'use client';

import { useTranslations } from 'next-intl';
import { formatMoney } from '../../lib/api';
import type { Product, TillSize } from '../../lib/api-types';
import { ProductPhoto } from '../../components/ProductPhoto';
import { IconMinus, IconPlus, IconTrash } from '../../components/icons';
import { canAddSize, hasSizes } from '../../lib/till-sizes';
import { lineKey, lineMinor, type BillLine } from './BillCard';

/**
 * Rich itemized bill rows for the desktop product-only POS terminal (`/pos`, `/orders/new`, `/products/sell`):
 * shows each product's visual thumbnail, title, SKU/size subtitle, clickable line price, `[ − n + ]` stepper,
 * and a single-click line delete button.
 */
export function PosBillRows({
  lines,
  products,
  listMinor,
  totalMinor,
  full,
  onLess,
  onMore,
  onClearLine,
  onEditPrice,
}: {
  lines: readonly BillLine[];
  products: readonly Product[];
  listMinor: number;
  totalMinor: number;
  full: boolean;
  onLess: (key: string) => void;
  onMore: (p: Product, size?: TillSize) => void;
  onClearLine: (key: string) => void;
  onEditPrice?: (key: string) => void;
}) {
  const t = useTranslations('payFlow');
  const productById = new Map(products.map((p) => [p.id, p]));

  const rows: Array<{
    key: string;
    name: string;
    count: number;
    minor: number;
    list: number;
    product?: Product;
    size?: TillSize;
  }> = [];

  for (const l of lines) {
    const key = lineKey(l);
    const same = rows.find((r) => r.key === key);
    if (same) {
      same.count += 1;
      same.minor += lineMinor(l);
      same.list += l.priceMinor;
    } else {
      const product = l.product ? productById.get(l.product.id) : undefined;
      const size = product && l.product?.variantId && hasSizes(product)
        ? product.sizes?.find((s) => s.id === l.product?.variantId)
        : undefined;
      rows.push({
        key,
        name: l.name,
        count: 1,
        minor: lineMinor(l),
        list: l.priceMinor,
        product,
        size,
      });
    }
  }

  const offMinor = listMinor - totalMinor;
  const money = (minor: number) => formatMoney(String(minor));

  return (
    <>
      <ul className="pf-bill-lines pos-bill-lines">
        {rows.map((r) => {
          const p = r.product;
          const canAddMore = p
            ? r.size
              ? !full && canAddSize(r.size, r.count)
              : !full && p.stock > r.count
            : false;
          const metaParts: string[] = [];
          if (r.count > 1) metaParts.push(`${money(Math.round(r.minor / r.count))} × ${r.count}`);
          if (p?.sku) metaParts.push(`SKU: ${p.sku}`);

          return (
            <li key={r.key} className="pos-bill-item">
              {p ? <ProductPhoto className="pos-bill-thumb" product={p} /> : null}
              <div className="pos-bill-item-body">
                <div className="pos-bill-item-top">
                  <span className="pos-bill-item-name">{r.name}</span>
                  {onEditPrice ? (
                    <button
                      type="button"
                      className="pf-bill-amount pf-bill-amount-tap pos-bill-item-amt"
                      aria-label={t('desk.priceFor', { name: r.name })}
                      onClick={() => onEditPrice(r.key)}
                    >
                      {r.minor !== r.list ? <s className="pf-bill-was">{money(r.list)}</s> : null}
                      {money(r.minor)}
                    </button>
                  ) : (
                    <span className="pf-bill-amount pos-bill-item-amt">{money(r.minor)}</span>
                  )}
                </div>
                <div className="pos-bill-item-bot">
                  <span className="pos-bill-item-sub">{metaParts.join(' · ')}</span>
                  <div className="pos-bill-item-ctrl">
                    <span className="pos-bill-stepper" role="group" aria-label={t('onBill', { count: r.count })}>
                      <button
                        type="button"
                        className="pos-step-btn"
                        aria-label={t('oneLess', { name: r.name })}
                        onClick={() => onLess(r.key)}
                      >
                        <IconMinus />
                      </button>
                      <span className="pos-step-val" aria-live="polite">
                        {r.count}
                      </span>
                      {p ? (
                        <button
                          type="button"
                          className="pos-step-btn"
                          aria-label={t('oneMore', { name: r.name })}
                          onClick={() => onMore(p, r.size)}
                          disabled={!canAddMore}
                        >
                          <IconPlus />
                        </button>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className="pos-bill-del"
                      aria-label={t('desk.removeLine', { name: r.name })}
                      onClick={() => onClearLine(r.key)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <dl className="pf-bill-sums pos-bill-sums">
        <div>
          <dt>{t('desk.subtotalUnits', { count: lines.length })}</dt>
          <dd>{money(listMinor)}</dd>
        </div>
        {offMinor !== 0 ? (
          <div className={offMinor > 0 ? 'pf-bill-off' : undefined}>
            <dt>{offMinor > 0 ? t('billOff') : t('billExtra')}</dt>
            <dd>
              {offMinor > 0 ? '−' : '+'}
              {money(Math.abs(offMinor))}
            </dd>
          </div>
        ) : null}
        <div className="pf-bill-total">
          <dt>{t('total')}</dt>
          <dd>{money(totalMinor)}</dd>
        </div>
      </dl>
    </>
  );
}
