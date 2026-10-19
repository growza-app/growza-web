'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { api, type TodoClient } from '../../lib/api';
import { whatsappHref } from '../../lib/receipt-text';
import { MessageClientsSheet } from '../../reports/MessageClientsSheet';
import { waDigits } from '../BookingSheet';
import { IconWhatsApp } from '../icons';

/** How many people the card shows before "See all". */
export const DUE_BACK_SHOWN = 3;

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; count: number; clients: TodoClient[] };

/**
 * Owner, 2026-10-19 — "Clients due back" on the owner's laptop Home, in the place Sales by payment method had (today's
 * money by method is already in Today's revenue).
 *
 * The same people and the same typed-in WhatsApp message as Reports → What to do, so the owner can act without leaving
 * Home. Nothing is sent by the product: `wa.me` opens the owner's own WhatsApp and they press send.
 */
export function DueBackCard({ branch, business }: { branch: string | null; business: string }) {
  const t = useTranslations('reports.todo');
  const h = useTranslations('reports.todo.homeCard');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setLoad({ state: 'loading' });
    api
      .reportsTodo(branch)
      .then((todo) => {
        if (!live) return;
        const card = todo.cards.find((c) => c.kind === 'dueBack');
        setLoad(card && card.kind === 'dueBack' ? { state: 'ready', count: card.count, clients: card.clients } : { state: 'ready', count: 0, clients: [] });
      })
      .catch(() => live && setLoad({ state: 'failed' }));
    return () => {
      live = false;
    };
  }, [branch, attempt]);

  const text = (client: TodoClient) => t('dueBack.text', { name: client.name, business });
  const ready = load.state === 'ready' ? load : null;

  return (
    <section className="hm-v3-card hm-v3-dueback-card">
      <div className="hm-v3-card-head">
        <h2>{ready && ready.count > 0 ? t('dueBack.title', { n: ready.count }) : h('title')}</h2>
      </div>

      {load.state === 'loading' && <p className="hm-empty">{h('loading')}</p>}

      {load.state === 'failed' && (
        <div className="hm-error" role="alert">
          <span>{h('failed')}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            {h('retry')}
          </button>
        </div>
      )}

      {ready && ready.count === 0 && <p className="hm-empty">{h('none')}</p>}

      {ready && ready.count > 0 && (
        <>
          <p className="hm-v3-dueback-hint">{t('dueBack.hint')}</p>
          <ul className="td-people hm-v3-dueback-list">
            {ready.clients.slice(0, DUE_BACK_SHOWN).map((c) => (
              <li key={c.customerId} className="td-person">
                <span className="td-person-who">
                  <span className="rp-avatar">{c.initial}</span>
                  <span className="td-person-text">
                    <span className="td-person-name">{c.name}</span>
                    <span className="td-person-meta">{c.lastVisitDays === null ? '' : t('sheet.lastIn', { n: c.lastVisitDays })}</span>
                  </span>
                </span>
                {c.waPhone ? (
                  <a className="btn td-wa" href={whatsappHref(waDigits(c.waPhone), text(c))} target="_blank" rel="noopener noreferrer">
                    <IconWhatsApp />
                    <span>{t('sheet.whatsapp')}</span>
                  </a>
                ) : (
                  <span className="td-person-quiet">{t(c.optedOut ? 'sheet.noNumber' : 'sheet.noPhone')}</span>
                )}
              </li>
            ))}
          </ul>
          {ready.count > DUE_BACK_SHOWN && (
            <button type="button" className="hm-v3-head-link hm-v3-dueback-all" onClick={() => setOpen(true)}>
              {h('seeAll', { n: ready.count })} →
            </button>
          )}
        </>
      )}

      {open && ready && (
        <MessageClientsSheet title={t('dueBack.title', { n: ready.count })} clients={ready.clients} text={text} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}
