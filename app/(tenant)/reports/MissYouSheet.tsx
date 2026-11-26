'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';
import type { BillOffer, RestaurantCustomersPage } from '../lib/api-types';
import { whatsappHref } from '../lib/receipt-text';
import { Avatar } from '../components/home/parts';
import { IconCheck, IconClose, IconWhatsApp } from '../components/icons';
import { useDialog } from '../../shared/a11y/useDialog';
import { DISH, MISS_YOU_KINDS, dishForMessage, missYouFor, missYouTemplate, offersToSend, type MissYouKind } from './miss-you';

type Guest = NonNullable<RestaurantCustomersPage['overdue']>['rows'][number];

/**
 * Owner, 2026-11-26 — "give some options to owners so they can generate some missing you messages … and directly click
 * on the WhatsApp button to send them". Step 1: pick a ready message (or edit it once for everyone), then tap each guest:
 * their own WhatsApp opens with it typed, and they press send. Nothing is sent by the product and nothing is stored.
 *
 * The Offer message is offered only when the branch has an offer a guest can use today, so the line matches the till.
 */
export function MissYouSheet({
  guests,
  business,
  location,
  todayISO,
  onClose,
}: {
  guests: Guest[];
  business: string | null;
  /** The branch whose offers the Offer message may name; none = no Offer choice. */
  location: string | null;
  todayISO: string;
  onClose: () => void;
}) {
  const t = useTranslations('restaurantReports.customers.missYou');
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, { onClose, initialFocus: 'container' });

  const [offers, setOffers] = useState<BillOffer[]>([]);
  const [kind, setKind] = useState<MissYouKind>('miss');
  const [offerId, setOfferId] = useState<string | null>(null);
  const [text, setText] = useState(() => missYouTemplate('miss', business));
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!location) return;
    let live = true;
    api
      .billOffers(location)
      .then((r) => {
        if (live) setOffers(offersToSend(r.offers, todayISO));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [location, todayISO, business]);

  const kinds = MISS_YOU_KINDS.filter((k) => k !== 'offer' || offers.length > 0);
  const offer = offers.find((o) => o.id === offerId) ?? offers[0] ?? null;

  const choose = (next: MissYouKind, nextOffer: BillOffer | null = offer) => {
    setKind(next);
    if (next === 'offer' && nextOffer) setOfferId(nextOffer.id);
    setText(missYouTemplate(next, business, nextOffer));
  };

  const message = text.trim();
  const reachable = guests.filter((g) => g.phone.replace(/\D/g, '').length >= 10);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet td-sheet my-sheet" role="dialog" aria-modal="true" aria-label={t('title')} ref={panel} tabIndex={-1}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2 className="sheet-title">{t('title')}</h2>
          <button type="button" className="td-sheet-close" onClick={onClose} aria-label={t('close')}>
            <IconClose />
          </button>
        </div>

        <div className="my-body">
          <div className="my-chips" role="radiogroup" aria-label={t('pick')}>
            {kinds.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={`my-chip${kind === k ? ' is-on' : ''}`} onClick={() => choose(k)}>
                {t(`kind.${k}`)}
              </button>
            ))}
          </div>

          {kind === 'offer' && offers.length > 1 ? (
            <div className="my-chips my-offers" role="radiogroup" aria-label={t('whichOffer')}>
              {offers.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={offer?.id === o.id} className={`my-chip${offer?.id === o.id ? ' is-on' : ''}`} onClick={() => choose('offer', o)}>
                  {o.name}
                </button>
              ))}
            </div>
          ) : null}

          <label className="my-label" htmlFor="my-text">
            {t('message')}
          </label>
          <textarea id="my-text" className="my-text" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="my-hint">{t('hint', { dish: DISH })}</p>

          <ul className="td-people my-people">
            {reachable.map((g) => {
              const done = sent.has(g.customerId);
              return (
                <li key={g.customerId} className="td-person">
                  <span className="td-person-who">
                    <Avatar name={g.name} id={g.customerId} size={36} />
                    <span className="td-person-text">
                      <span className="td-person-name">{g.name ?? t('guest')}</span>
                      <span className="td-person-meta">
                        {t('away', { n: g.lastSeenDaysAgo })}
                        {dishForMessage(g.favouriteDish) ? ` · ${dishForMessage(g.favouriteDish)}` : ''}
                      </span>
                    </span>
                  </span>
                  {message ? (
                    <a
                      className={`btn td-wa my-send${done ? ' is-sent' : ''}`}
                      href={whatsappHref(g.phone.replace(/\D/g, ''), missYouFor(message, g.favouriteDish))}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={done ? t('sentAria', { name: g.name ?? t('guest') }) : t('sendAria', { name: g.name ?? t('guest') })}
                      onClick={() => setSent((s) => new Set(s).add(g.customerId))}
                    >
                      {done ? <IconCheck /> : <IconWhatsApp />}
                      <span>{done ? t('sent') : t('send')}</span>
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {message ? null : <p className="field-error" role="alert">{t('empty')}</p>}
        </div>
      </div>
    </>
  );
}
