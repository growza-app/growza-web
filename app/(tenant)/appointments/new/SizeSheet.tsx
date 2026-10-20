'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Product, TillSize } from '../../lib/api-types';
import { formatMoney } from '../../lib/api';
import { canAddSize, colourChoices, secondAxisName, sizeLabel, sizePriceMinor, sizesFor } from '../../lib/till-sizes';
import { useDialog } from '../../../shared/a11y/useDialog';
import { IconCheck, IconMinus, IconPlus } from '../../components/icons';

/**
 * Jira GRW-599 — the till's size grid: a product's sizes in one bottom sheet, one tap to add one.
 *
 * Decided with the owner and not up for re-litigation here: a grid and not a dropdown, no sheet inside a sheet; the
 * owner's order, always, never most-sold-first (staff build muscle memory); the count under each size. A size with
 * none left is shown and dimmed but cannot go on the bill — the rule a plain product has at this till, and the one
 * the server holds (a sale never takes a count below zero). A barcode scan skips all of this.
 *
 * The sizes come with the product the till already read: opening this sheet costs no request. The bill's quantity for
 * a size is adjusted right here, with − and +, in the list under the grid.
 */
export function SizeSheet({
  product,
  onBill,
  full,
  onAdd,
  onLess,
  onClose,
}: {
  product: Product;
  /** How many of each size (by id) the bill holds. */
  onBill: (variantId: string) => number;
  full: boolean;
  onAdd: (size: TillSize) => void;
  onLess: (size: TillSize) => void;
  onClose: () => void;
}) {
  const t = useTranslations('payFlow');
  const ts = useTranslations('payFlow.size');
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose, initialFocus: 'container' });

  const colours = useMemo(() => colourChoices(product), [product]);
  const [colour, setColour] = useState<string | null>(colours[0] ?? null);
  // The colour chosen may have gone off the shelf since the sheet opened: fall back to the first that is still there.
  useEffect(() => {
    if (colour !== null && !colours.some((c) => c.toLowerCase() === colour.toLowerCase())) setColour(colours[0] ?? null);
  }, [colour, colours]);

  // A double tap at a busy counter adds one, not two: the same size within this long is the same tap.
  const lastTap = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const tap = (size: TillSize) => {
    const now = Date.now();
    if (lastTap.current.id === size.id && now - lastTap.current.at < 350) return;
    lastTap.current = { id: size.id, at: now };
    onAdd(size);
  };

  const sizes = sizesFor(product, colour);
  const chosen = (product.sizes ?? []).filter((s) => onBill(s.id) > 0);
  const priceFrom = product.sizes && product.sizes.length > 0 ? Math.min(...product.sizes.map((s) => sizePriceMinor(product, s))) : Number(product.priceMinor ?? 0);

  return (
    <div className="pf-keypad-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="pf-keypad psz-sheet" role="dialog" aria-modal="true" aria-label={`${ts('title')}: ${product.name}`} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">
            {product.name}
            <span className="psz-price">{formatMoney(priceFrom)}</span>
          </span>
          <button type="button" className="pf-keypad-clear" onClick={onClose}>
            {ts('close')}
          </button>
        </div>

        {colours.length > 1 ? (
          <div className="pf-chips psz-colours" role="group" aria-label={secondAxisName(product)}>
            {colours.map((c) => (
              <button key={c} type="button" className={`pf-chip ${colour?.toLowerCase() === c.toLowerCase() ? 'pf-chip-on' : ''}`} aria-pressed={colour?.toLowerCase() === c.toLowerCase()} onClick={() => setColour(c)}>
                {c}
              </button>
            ))}
          </div>
        ) : null}

        {full ? (
          <p className="psz-note" role="status">
            {ts('full')}
          </p>
        ) : null}

        {sizes.length === 0 ? (
          <p className="psz-note">{ts('noSizes')}</p>
        ) : (
          <div className="psz-grid" role="group" aria-label={ts('title')}>
            {sizes.map((size) => {
              const n = onBill(size.id);
              const out = size.stock <= 0;
              const label = colour === null ? sizeLabel(size) : size.option1;
              return (
                <button
                  key={size.id}
                  type="button"
                  className={`psz-cell ${n > 0 ? 'is-on' : ''} ${out ? 'is-out' : ''}`}
                  aria-label={out ? ts('cellOut', { size: sizeLabel(size) }) : n > 0 ? ts('cellOn', { size: sizeLabel(size), count: n }) : ts('cellLeft', { size: sizeLabel(size), n: size.stock })}
                  aria-pressed={n > 0}
                  disabled={out || full || !canAddSize(size, n)}
                  onClick={() => tap(size)}
                >
                  <span className="psz-label">{label}</span>
                  <span className="psz-left">{out ? t('outOfStock') : t('left', { n: size.stock })}</span>
                  {n > 0 ? (
                    <span className="psz-badge" aria-hidden="true">
                      <IconCheck /> {n}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        {chosen.length > 0 ? (
          <div className="psz-bill">
            <span className="psz-bill-title">{ts('onThisBill')}</span>
            <ul className="psz-lines">
              {chosen.map((size) => (
                <li key={size.id} className="psz-line">
                  <span className="psz-line-name">{sizeLabel(size)}</span>
                  <span className="pf-tile-qty psz-qty" role="group" aria-label={t('onBill', { count: onBill(size.id) })}>
                    <button type="button" className="pf-qty-btn" aria-label={ts('sizeLess', { name: `${product.name} ${sizeLabel(size)}` })} onClick={() => onLess(size)}>
                      <IconMinus />
                    </button>
                    <span className="pf-qty-n" aria-live="polite">
                      {onBill(size.id)}
                    </span>
                    <button
                      type="button"
                      className="pf-qty-btn"
                      aria-label={ts('sizeMore', { name: `${product.name} ${sizeLabel(size)}` })}
                      aria-disabled={full || !canAddSize(size, onBill(size.id)) || undefined}
                      // An explicit +, not a grid tap: two quick taps are two units, so it does not go through the double-tap guard.
                      onClick={() => (!full && canAddSize(size, onBill(size.id)) ? onAdd(size) : undefined)}
                    >
                      <IconPlus />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
