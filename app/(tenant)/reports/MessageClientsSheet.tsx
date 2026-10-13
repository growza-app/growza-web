'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRef } from 'react';

import { formatMoney, type TodoClient } from '../lib/api';
import { whatsappHref } from '../lib/receipt-text';
import { waDigits } from '../components/BookingSheet';
import { IconClose, IconPhone, IconWhatsApp } from '../components/icons';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * The people behind a What-to-do card, each with a WhatsApp button and a
 * Call button.
 *
 * WhatsApp is a `wa.me` link with the message already typed: it opens the
 * owner's own WhatsApp and they press send. Nothing is sent by the product,
 * so the compliance funnel is not bypassed — this is the owner's phone
 * doing what it did before, with the typing done for them. A client who
 * asked not to be contacted has no button, only the reason.
 */
export function MessageClientsSheet({
  title,
  clients,
  text,
  onClose,
  onClient,
}: {
  title: string;
  clients: TodoClient[];
  /** The message for one client, in the owner's language. */
  text: (client: TodoClient) => string;
  onClose: () => void;
  onClient?: (id: string) => void;
}) {
  const t = useTranslations('reports.todo.sheet');
  const locale = useLocale();
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, { onClose, initialFocus: 'container' });

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet td-sheet" role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="td-sheet-close" onClick={onClose} aria-label={t('close')}>
            <IconClose />
          </button>
        </div>
        <ul className="td-people">
          {clients.map((c) => {
            const meta = [
              c.lastVisitDays === null ? null : t('lastIn', { n: c.lastVisitDays }),
              c.intervalDays === null ? null : t('usually', { days: c.intervalDays }),
              c.avgTicketMinor === null ? null : t('worth', { amount: formatMoney(String(c.avgTicketMinor), 'INR', locale) }),
              c.usualService,
            ].filter(Boolean);
            return (
              <li key={c.customerId} className="td-person">
                <button
                  type="button"
                  className="td-person-who"
                  disabled={!onClient}
                  onClick={onClient ? () => onClient(c.customerId) : undefined}
                >
                  <span className="rp-avatar">{c.initial}</span>
                  <span className="td-person-text">
                    <span className="td-person-name">{c.name}</span>
                    <span className="td-person-meta">{meta.join(' · ')}</span>
                  </span>
                </button>
                {c.waPhone ? (
                  <span className="td-person-actions">
                    <a className="btn td-wa" href={whatsappHref(waDigits(c.waPhone), text(c))} target="_blank" rel="noopener noreferrer">
                      <IconWhatsApp />
                      <span>{t('whatsapp')}</span>
                    </a>
                    <a className="btn btn-ghost td-call" href={`tel:${c.waPhone}`} aria-label={t('call')}>
                      <IconPhone />
                    </a>
                  </span>
                ) : (
                  <span className="td-person-quiet">{t(c.optedOut ? 'noNumber' : 'noPhone')}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
