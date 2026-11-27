'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import type { RestaurantPointsWaiting } from '../lib/api-types';
import { whatsappHref } from '../lib/receipt-text';
import { Avatar } from '../components/home/parts';
import { IconCheck, IconClose, IconWhatsApp } from '../components/icons';
import { useDialog } from '../../shared/a11y/useDialog';
import { POINTS, WORTH, pointsFor, pointsNumber, pointsTemplate, rupees, shortDay } from './points-reminder';

/**
 * Owner, 2026-11-27 — remind guests to use their points. One message (editable once, for everyone), then a Send per
 * guest: their own WhatsApp opens with it typed, with their own points, worth and expiry. Nothing is sent by the product
 * and nothing is stored. The same sheet as the "we miss you" messages, without the choice of words.
 */
export function PointsSheet({ guests, business, onClose }: { guests: RestaurantPointsWaiting['rows']; business: string | null; onClose: () => void }) {
  const t = useTranslations('restaurantReports.customers.points');
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, { onClose, initialFocus: 'container' });
  const [text, setText] = useState(() => pointsTemplate(business));
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());

  const message = text.trim();
  const reachable = guests.filter((g) => g.phone.replace(/\D/g, '').length >= 10);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet td-sheet my-sheet" role="dialog" aria-modal="true" aria-label={t('sheetTitle')} ref={panel} tabIndex={-1}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2 className="sheet-title">{t('sheetTitle')}</h2>
          <button type="button" className="td-sheet-close" onClick={onClose} aria-label={t('close')}>
            <IconClose />
          </button>
        </div>

        <div className="my-body">
          <label className="my-label" htmlFor="pts-text">
            {t('message')}
          </label>
          <textarea id="pts-text" className="my-text" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="my-hint">{t('hint', { points: POINTS, worth: WORTH })}</p>

          <ul className="td-people my-people">
            {reachable.map((g) => {
              const done = sent.has(g.customerId);
              const name = g.name ?? t('guest');
              return (
                <li key={g.customerId} className="td-person">
                  <span className="td-person-who">
                    <Avatar name={g.name} id={g.customerId} size={36} />
                    <span className="td-person-text">
                      <span className="td-person-name">{name}</span>
                      <span className="td-person-meta">
                        {t('worth', { points: pointsNumber(g.points), worth: rupees(g.worthMinor) })}
                        {g.expiring ? ` · ${t('expires', { n: pointsNumber(g.expiring.points), date: shortDay(g.expiring.on) })}` : ''}
                      </span>
                    </span>
                  </span>
                  {message ? (
                    <a
                      className={`btn td-wa my-send${done ? ' is-sent' : ''}`}
                      href={whatsappHref(g.phone.replace(/\D/g, ''), pointsFor(message, g))}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={done ? t('sentAria', { name }) : t('sendAria', { name })}
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
