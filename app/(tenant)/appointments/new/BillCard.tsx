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
  /**
   * Jira GRW-572 — the package this line is a leg of, when it is one. Its legs are sent as the service lines
   * the route takes (each with its share of the package price) plus the `offerId`; on the bill they read as
   * ONE row at the package price, and taking that row off takes every leg with it.
   */
  pkg?: { id: string; title: string; priceMinor: number };
  /** Owner, 2026-10-14 — what this line is charged at when the desk typed a price for it; absent means the list price. */
  paidMinor?: number;
  /**
   * Owner, 2026-10-14 — a product on the bill (migration 0115). One line per unit, like a service rung up twice,
   * so the same count and − work; `serviceId` is '' and the line goes to the route as `products`, grouped by id.
   */
  product?: { id: string };
}

/** The bill row's key: a service id, a package id, or `p:` + a product id. */
export const lineKey = (l: BillLine): string => (l.pkg ? l.pkg.id : l.product ? `p:${l.product.id}` : l.serviceId);

/** What a line is worth before the whole-bill total is typed over: its typed price, else its list price. */
export const lineMinor = (l: BillLine): number => l.paidMinor ?? l.priceMinor;

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
  onPrice,
}: {
  lines: readonly BillLine[];
  /** What the services list at, before anything was changed by hand. */
  listMinor: number;
  /** What is being taken — the list price, or the figure typed over it. */
  totalMinor: number;
  /** The row's key: a service id, or a package id (which takes every leg off). */
  onLess: (key: string) => void;
  onClose: () => void;
  /** Tapping a row's amount asks for a price for that row. Absent: the amount is plain text. */
  onPrice?: (key: string) => void;
}) {
  const t = useTranslations('payFlow');
  const nv = useNewVisitCopy();
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose, initialFocus: 'container' });

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
        <BillRows lines={lines} listMinor={listMinor} totalMinor={totalMinor} onLess={onLess} onPrice={onPrice} />
      </div>
    </div>
  );
}

/**
 * Jira GRW-572 — the rows and the sums on their own, so the wide till can show the bill in its right-hand
 * panel all the time instead of behind a tap. The card above is this inside a dialog.
 */
export function BillRows({
  lines,
  listMinor,
  totalMinor,
  onLess,
  onPrice,
}: {
  lines: readonly BillLine[];
  listMinor: number;
  totalMinor: number;
  onLess: (key: string) => void;
  onPrice?: (key: string) => void;
}) {
  const t = useTranslations('payFlow');
  // Same service rung up twice is one row with a count, as the receipt groups it. A package is one row too.
  // `minor` is what the row is charged; `list` what it would be at list prices, shown struck through when they differ.
  const rows: Array<{ key: string; name: string; count: number; minor: number; list: number; sub?: string }> = [];
  for (const l of lines) {
    if (l.pkg) {
      const same = rows.find((r) => r.key === l.pkg!.id);
      if (same) same.sub = [same.sub, l.name].filter(Boolean).join(', ');
      else rows.push({ key: l.pkg.id, name: l.pkg.title, count: 1, minor: l.pkg.priceMinor, list: l.pkg.priceMinor, sub: l.name });
      continue;
    }
    const key = lineKey(l);
    const same = rows.find((r) => r.key === key);
    if (same) {
      same.count += 1;
      same.minor += lineMinor(l);
      same.list += l.priceMinor;
    } else rows.push({ key, name: l.name, count: 1, minor: lineMinor(l), list: l.priceMinor });
  }
  const offMinor = listMinor - totalMinor;
  const money = (minor: number) => formatMoney(String(minor));

  return (
    <>
        <ul className="pf-bill-lines">
          {rows.map((r) => (
            <li key={r.key} className="pf-bill-line">
              <span className="pf-bill-name">
                {r.name}
                {r.count > 1 ? <span className="pf-bill-times"> × {r.count}</span> : null}
                {r.sub ? <span className="pf-bill-sub">{r.sub}</span> : null}
              </span>
              {onPrice ? (
                <button type="button" className="pf-bill-amount pf-bill-amount-tap" aria-label={t('desk.priceFor', { name: r.name })} onClick={() => onPrice(r.key)}>
                  {r.minor !== r.list ? <s className="pf-bill-was">{money(r.list)}</s> : null}
                  {money(r.minor)}
                </button>
              ) : (
                <span className="pf-bill-amount">{money(r.minor)}</span>
              )}
              <button type="button" className="pf-bill-less" aria-label={t('oneLess', { name: r.name })} onClick={() => onLess(r.key)}>
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
    </>
  );
}
