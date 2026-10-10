'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { formatMoney } from '../../lib/api';
import { useNewVisitCopy } from '../../lib/use-copy';
import { useDialog } from '../../../shared/a11y/useDialog';
import { IconMinus } from '../../components/icons';

/** One line of the bill: one leg of the visit, as `POST /counter-sales` takes them. */
export interface BillLine {
  serviceId: string;
  name: string;
  priceMinor: number;
}

/**
 * What is on the bill, in full (owner, 2026-10-10).
 *
 * The tray shows one figure, and when that figure has been changed by hand it is the only thing on screen that
 * knows. This card is the itemised answer: every service with how many of it and what it lists at, what they add
 * up to, what is coming off, and the amount actually being taken. Each row can lose one from here, so a mistake
 * spotted while reading the bill is fixed where it is seen rather than back among the tiles.
 */
export function BillCard({
  lines,
  listMinor,
  totalMinor,
  onLess,
  onClose,
}: {
  lines: readonly BillLine[];
  /** What the services list at, before anything was changed by hand. */
  listMinor: number;
  /** What is being taken — the list price, or the figure typed over it. */
  totalMinor: number;
  onLess: (serviceId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('payFlow');
  const nv = useNewVisitCopy();
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose, initialFocus: 'container' });

  // Same service rung up twice is one row with a count, as the receipt groups it.
  const rows: Array<{ serviceId: string; name: string; count: number; minor: number }> = [];
  for (const l of lines) {
    const same = rows.find((r) => r.serviceId === l.serviceId);
    if (same) {
      same.count += 1;
      same.minor += l.priceMinor;
    } else rows.push({ serviceId: l.serviceId, name: l.name, count: 1, minor: l.priceMinor });
  }
  const offMinor = listMinor - totalMinor;
  const money = (minor: number) => formatMoney(String(minor));

  // A tap on the dimmed area closes it, as every other sheet in the app does (`sheet-backdrop`).
  return (
    <div className="pf-keypad-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="pf-keypad pf-bill" role="dialog" aria-modal="true" aria-label={t('billTitle')} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{t('billTitle')}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose}>
            {nv.close}
          </button>
        </div>

        <ul className="pf-bill-lines">
          {rows.map((r) => (
            <li key={r.serviceId} className="pf-bill-line">
              <span className="pf-bill-name">
                {r.name}
                {r.count > 1 ? <span className="pf-bill-times"> × {r.count}</span> : null}
              </span>
              <span className="pf-bill-amount">{money(r.minor)}</span>
              <button type="button" className="pf-bill-less" aria-label={t('oneLess', { name: r.name })} onClick={() => onLess(r.serviceId)}>
                <IconMinus />
              </button>
            </li>
          ))}
        </ul>

        <dl className="pf-bill-sums">
          {offMinor !== 0 ? (
            <>
              <div>
                <dt>{t('billList')}</dt>
                <dd>{money(listMinor)}</dd>
              </div>
              {/* Off the list price, or added to it — a desk may round a bill up as readily as down. */}
              <div className={offMinor > 0 ? 'pf-bill-off' : undefined}>
                <dt>{offMinor > 0 ? t('billOff') : t('billExtra')}</dt>
                <dd>
                  {offMinor > 0 ? '−' : '+'}
                  {money(Math.abs(offMinor))}
                </dd>
              </div>
            </>
          ) : null}
          <div className="pf-bill-total">
            <dt>{t('total')}</dt>
            <dd>{money(totalMinor)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
