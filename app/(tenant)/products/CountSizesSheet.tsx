'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import type { Product } from '../lib/api-types';
import { useDialog } from '../../shared/a11y/useDialog';
import { sizeLabel } from '../lib/till-sizes';
import { countedOf, readTypedSize, sizeGap, sizesOf, uncountedOf } from './count-sizes';

/**
 * Jira GRW-602 — count one style's sizes, in a bottom sheet over the stock take.
 *
 * Decided with the owner (2026-10-20): a sheet per style, so the shelf list stays the shelf list. Built for an hour of
 * one-handed use at 344px: a row per size in the owner's order, the recorded number beside the field, the gap shown as
 * soon as a number is typed, a numeric keypad, Enter moves to the next size. A box left empty is not counted and stays
 * as it is. Nothing animates. What is typed lives in the stock take, not here, so closing the sheet loses nothing.
 */
export function CountSizesSheet({
  product,
  typed,
  onType,
  onClose,
}: {
  product: Product;
  /** What has been typed for every size, by size id (text). */
  typed: Readonly<Record<string, string>>;
  onType: (variantId: string, raw: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('products.stockTake');
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose, initialFocus: 'container' });
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const sizes = sizesOf(product);
  const left = uncountedOf(product, typed);

  return (
    <div className="pf-keypad-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="pf-keypad pcs-sheet" role="dialog" aria-modal="true" aria-label={t('sizesTitle', { name: product.name })} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{t('sizesTitle', { name: product.name })}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose}>
            {t('doneSizes')}
          </button>
        </div>

        {sizes.length === 0 ? (
          <p className="pcs-note">{t('sizesNone')}</p>
        ) : (
          <>
            <p className="pcs-note">{t('blankNote')}</p>
            <ul className="pcs-rows">
              {sizes.map((s, i) => {
                const raw = typed[s.id] ?? '';
                const kind = readTypedSize(raw).kind;
                const gap = sizeGap(s, raw);
                return (
                  <li key={s.id} className={`pcs-row ${gap !== null && gap !== 0 ? 'is-diff' : ''} ${kind === 'invalid' ? 'is-invalid' : ''}`}>
                    <span className="pcs-size">
                      <span className="pcs-label">{sizeLabel(s)}</span>
                      <span className="pcs-recorded">{t('recorded', { n: s.stock })}</span>
                    </span>
                    {gap !== null && gap !== 0 ? <span className={`prd-pill ${gap > 0 ? '' : 'prd-pill-out'}`}>{gap > 0 ? `+${gap}` : String(gap)}</span> : null}
                    <input
                      ref={(el) => {
                        inputs.current[i] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      // i18n-ok: a keyboard hint (the Enter key's label), not text the owner reads
                      enterKeyHint={i === sizes.length - 1 ? 'done' : 'next'}
                      className="pcs-input"
                      aria-label={t('sizeAria', { name: product.name, size: sizeLabel(s) })}
                      aria-invalid={kind === 'invalid' ? 'true' : undefined}
                      value={raw}
                      onChange={(e) => onType(s.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const next = inputs.current[i + 1];
                        if (next) next.focus();
                        else onClose();
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="pcs-bar">
          <span className="pcs-left" aria-live="polite">
            {sizes.length === 0 ? '' : left === 0 ? t('allCounted') : t('uncounted', { n: left })}
          </span>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('doneSizes')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "3 of 14 counted" for the style's row on the shelf list. */
export function sizesCountedLine(product: Product, typed: Readonly<Record<string, string>>): { n: number; m: number } {
  return { n: countedOf(product, typed), m: sizesOf(product).length };
}
