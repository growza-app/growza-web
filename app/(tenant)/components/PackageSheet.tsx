'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import type { Offer, Service } from '../lib/api-types';
import { formatMoney } from '../lib/api';
import { useDialog } from '../../shared/a11y/useDialog';
import { servicePhotoUrl } from '../lib/service-photos';

/**
 * Owner, 2026-10-15 — what is inside a package, before it goes on the bill.
 *
 * The desk asked for it: a tile says "Pre-Bridal Package ₹6,000 — Facial, Threading, …" and cuts the list off.
 * This sheet says every service with its minutes and price, what they would cost one by one, what the package
 * saves, and when it can be sold; then one button adds it (or takes it off, if it is already on the bill).
 */
export function PackageSheet({
  offer,
  services,
  countOf,
  onPick,
  onLess,
  onClose,
}: {
  offer: Offer;
  services: readonly Service[];
  /** How many times this package is on the bill. */
  countOf: (offerId: string) => number;
  /** Add one (or, on a bill that holds one package, toggle it). */
  onPick: (o: Offer) => void;
  /** One fewer. Absent on the one-page form, where picking the package again takes it off. */
  onLess?: (offerId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('payFlow.pkg');
  const ref = useRef<HTMLDivElement>(null);
  const count = countOf(offer.id);
  const onBill = count > 0;
  const onAdd = () => {
    onPick(offer);
    onClose();
  };
  const onRemove = () => {
    if (onLess) onLess(offer.id);
    else onPick(offer);
    onClose();
  };
  useDialog(ref, { onClose });
  const byId = new Map(services.map((s) => [s.id, s]));
  const inside = offer.serviceIds.map((id) => byId.get(id)).filter((s): s is Service => Boolean(s));
  const listTotal = inside.reduce((sum, s) => sum + Number(s.priceMinor ?? 0), 0);
  const minutes = inside.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
  const price = offer.comboPriceMinor ? Number(offer.comboPriceMinor) : null;
  const saves = price !== null && listTotal > price ? listTotal - price : 0;
  const until = offer.visibleUntil ? new Date(offer.visibleUntil) : null;

  return (
    <div className="pf-keypad-scrim pf-pkg-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="pf-keypad pf-client pf-pkg" role="dialog" aria-modal="true" aria-label={offer.title} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{offer.title}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose}>
            {t('close')}
          </button>
        </div>
        <div className="pf-pkg-price">
          <span className="pf-pkg-price-n">{price !== null ? formatMoney(price) : t('noPrice')}</span>
          {saves > 0 ? <span className="pf-pkg-save">{t('youSave', { amount: formatMoney(saves), list: formatMoney(listTotal) })}</span> : null}
          {minutes > 0 ? <span className="pf-pkg-mins">{t('mins', { n: minutes, count: inside.length })}</span> : null}
        </div>
        {offer.description ? <p className="pf-pkg-desc">{offer.description}</p> : null}
        <h3 className="pf-pkg-h">{t('inside')}</h3>
        <ul className="pf-client-matches pf-menu-list pf-pkg-list">
          {inside.map((s) => (
            <li key={s.id} className="pf-pkg-row">
              <img className="pf-menu-photo" src={servicePhotoUrl(s)} alt="" loading="lazy" />
              <span className="pf-client-match-name">{s.name}</span>
              <span className="pf-client-match-sub">
                {s.durationMin ? `${t('eachMins', { n: s.durationMin })} · ` : ''}
                {formatMoney(s.priceMinor)}
              </span>
            </li>
          ))}
        </ul>
        {until ? <p className="pf-pkg-note">{t('until', { date: until.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) })}</p> : null}
        <div className="pf-pkg-foot">
          {onBill ? (
            <button type="button" className="btn btn-ghost" onClick={onRemove}>
              {t('remove')}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onAdd} disabled={onBill && !onLess}>
            {onBill && onLess ? t('addAnother', { n: count }) : onBill ? t('onBill') : t('add')}
          </button>
        </div>
      </div>
    </div>
  );
}
