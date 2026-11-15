'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useDialog } from '../../../shared/a11y/useDialog';
import { useScrimDismiss } from '../../../shared/a11y/scrim-dismiss';
import { formatMoney } from '../../lib/api';
import { discountFrom, QUICK_PERCENTS, type DiscountKind } from './bill-discount';

/**
 * Owner, 2026-11-15 — Discount on the whole bill: a percentage or an amount, with 5 · 10 · 15 · 20% a tap away.
 *
 * The same sheet as the total's keypad (`pf-keypad`), so it opens where the counter already looks. It shows what the
 * bill comes to before anything is applied — "−₹38 · Total ₹342" — because a percentage is the one figure at a
 * counter nobody should have to work out in their head.
 */
export function DiscountSheet({
  listMinor,
  current,
  onApply,
  onRemove,
  onClose,
}: {
  /** What the bill comes to before any discount. */
  listMinor: number;
  /** The discount on the bill now, if there is one: its percentage when it was given as one. */
  current: { pct: number | null; offMinor: number } | null;
  onApply: (offMinor: number, pct: number | null) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('payFlow.discount');
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose, initialFocus: 'container' });
  const scrimDismiss = useScrimDismiss(onClose);
  const [kind, setKind] = useState<DiscountKind>(current && current.pct === null ? 'amount' : 'pct');
  const [typed, setTyped] = useState(current ? (current.pct !== null ? String(current.pct) : String(current.offMinor / 100)) : '');
  const money = (minor: number) => formatMoney(String(minor));
  const result = discountFrom(kind, typed, listMinor);
  const ok = 'offMinor' in result;

  const apply = () => {
    if (!ok) return;
    onApply(result.offMinor, kind === 'pct' ? Number(typed) : null);
  };

  return (
    <div className="pf-keypad-scrim" {...scrimDismiss}>
      <div ref={ref} className="pf-keypad pf-discount" role="dialog" aria-modal="true" aria-label={t('title')} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{t('title')}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose}>
            {t('close')}
          </button>
        </div>

        <div className="pf-discount-kind" role="radiogroup" aria-label={t('kind')}>
          {(['pct', 'amount'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={kind === k ? 'is-on' : ''}
              onClick={() => {
                setKind(k);
                setTyped('');
              }}
            >
              {k === 'pct' ? t('percent') : t('amount')}
            </button>
          ))}
        </div>

        {kind === 'pct' ? (
          <div className="pf-discount-quick">
            {QUICK_PERCENTS.map((p) => (
              <button key={p} type="button" className={typed === String(p) ? 'is-on' : ''} onClick={() => setTyped(String(p))}>
                {t('pctChip', { pct: p })}
              </button>
            ))}
          </div>
        ) : null}

        <label className="pf-discount-field">
          <span>{kind === 'pct' ? t('typePercent') : t('typeAmount')}</span>
          <span className="pf-discount-input">
            {kind === 'amount' ? <span aria-hidden="true">₹</span> : null}
            <input
              type="text"
              inputMode={kind === 'pct' ? 'decimal' : 'numeric'}
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value.replace(/[^0-9.]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply();
              }}
            />
            {kind === 'pct' ? <span aria-hidden="true">%</span> : null}
          </span>
        </label>

        <p className={`pf-discount-preview${!ok && result.problem !== 'empty' ? ' is-bad' : ''}`} role="status">
          {ok
            ? t('preview', { off: money(result.offMinor), total: money(listMinor - result.offMinor) })
            : result.problem === 'tooBig'
              ? kind === 'pct'
                ? t('tooBigPct')
                : t('tooBigAmount', { bill: money(listMinor) })
              : result.problem === 'notWhole'
                ? t('wholeRupees')
                : t('billIs', { bill: money(listMinor) })}
        </p>

        <div className="pf-discount-actions">
          {current ? (
            <button type="button" className="btn btn-ghost" onClick={onRemove}>
              {t('remove')}
            </button>
          ) : null}
          <button type="button" className="btn" disabled={!ok} onClick={apply}>
            {t('apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
