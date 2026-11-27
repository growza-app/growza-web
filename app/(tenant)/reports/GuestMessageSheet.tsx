'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';

import { whatsappHref } from '../lib/receipt-text';
import { Avatar } from '../components/home/parts';
import { IconCheck, IconClose, IconWhatsApp } from '../components/icons';
import { useDialog } from '../../shared/a11y/useDialog';
import { useSession } from '../components/SessionProvider';
import { todayInZone } from '../lib/report-dates';
import { useMessaged } from './messaged';

export interface MessageGuest {
  customerId: string;
  name: string | null;
  phone: string;
}

/**
 * Reports › Guests — one message (editable once, for everyone), then a Send per guest: their own WhatsApp opens with it
 * typed. Nothing is sent by the product and nothing is stored. Shared by the points reminder and the dish fans list,
 * each passing its own words (`sheetLabels`).
 */
export interface SheetLabels {
  close: string;
  message: string;
  guest: string;
  send: string;
  sent: string;
  empty: string;
  sendAria: (name: string) => string;
  sentAria: (name: string) => string;
}

/** The sheet's words from a messages namespace that holds close, message, guest, send, sent, empty, sendAria, sentAria. */
export function sheetLabels(t: (key: 'close' | 'message' | 'guest' | 'send' | 'sent' | 'empty' | 'sendAria' | 'sentAria', v?: { name: string }) => string): SheetLabels {
  return {
    close: t('close'),
    message: t('message'),
    guest: t('guest'),
    send: t('send'),
    sent: t('sent'),
    empty: t('empty'),
    sendAria: (name) => t('sendAria', { name }),
    sentAria: (name) => t('sentAria', { name }),
  };
}

export function GuestMessageSheet<G extends MessageGuest>({
  labels,
  title,
  initialText,
  hint,
  guests,
  meta,
  messageFor,
  onClose,
}: {
  labels: SheetLabels;
  title: string;
  initialText: string;
  hint: ReactNode;
  guests: readonly G[];
  meta: (g: G) => ReactNode;
  messageFor: (text: string, g: G) => string;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, { onClose, initialFocus: 'container' });
  const [text, setText] = useState(initialText);
  // Sent from any Guests list, in this browser, lately — a guest on three lists is not sent three messages unseen.
  const tc = useTranslations('restaurantReports.customers');
  const session = useSession();
  const messaged = useMessaged(todayInZone(session?.timezone));

  const message = text.trim();
  const reachable = guests.filter((g) => g.phone.replace(/\D/g, '').length >= 10);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet td-sheet my-sheet" role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="td-sheet-close" onClick={onClose} aria-label={labels.close}>
            <IconClose />
          </button>
        </div>

        <div className="my-body">
          <label className="my-label" htmlFor="gm-text">
            {labels.message}
          </label>
          <textarea id="gm-text" className="my-text" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="my-hint">{hint}</p>

          <ul className="td-people my-people">
            {reachable.map((g) => {
              const ago = messaged.daysAgo(g.phone);
              const done = ago === 0;
              const name = g.name ?? labels.guest;
              return (
                <li key={g.customerId} className="td-person">
                  <span className="td-person-who">
                    <Avatar name={g.name} id={g.customerId} size={36} />
                    <span className="td-person-text">
                      <span className="td-person-name">{name}</span>
                      <span className="td-person-meta">
                        {meta(g)}
                        {ago !== null && ago > 0 ? ` · ${tc('messaged', { n: ago })}` : ''}
                      </span>
                    </span>
                  </span>
                  {message ? (
                    <a
                      className={`btn td-wa my-send${done ? ' is-sent' : ''}`}
                      href={whatsappHref(g.phone.replace(/\D/g, ''), messageFor(message, g))}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={done ? labels.sentAria(name) : labels.sendAria(name)}
                      onClick={() => messaged.mark(g.phone)}
                    >
                      {done ? <IconCheck /> : <IconWhatsApp />}
                      <span>{done ? labels.sent : labels.send}</span>
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {message ? null : <p className="field-error" role="alert">{labels.empty}</p>}
        </div>
      </div>
    </>
  );
}
