'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { api, type TodoClient } from '../../lib/api';
import { whatsappHref } from '../../lib/receipt-text';
import { MessageClientsSheet } from '../../reports/MessageClientsSheet';
import { waDigits } from '../BookingSheet';
import { IconWhatsApp } from '../icons';
import { DUE_BACK_DESKTOP_QUERY, DUE_BACK_REFRESH_MS, DUE_BACK_SHOWN, dueBackOf, type DueBack } from './due-back';

type Load = { state: 'loading' } | { state: 'failed' } | ({ state: 'ready' } & DueBack);

/**
 * Owner, 2026-10-19 — "Clients due back" on the owner's laptop Home, in the place Sales by payment method had (today's
 * money by method is already in Today's revenue).
 *
 * The same people and the same typed-in WhatsApp message as Reports → What to do, so the owner can act without leaving
 * Home. Nothing is sent by the product: `wa.me` opens the owner's own WhatsApp and they press send.
 *
 * Home draws its laptop layout on a phone too (CSS hides it), so the card reads nothing below the laptop breakpoint.
 * Once read it stays fresh: a failed refresh keeps what is on screen, and a new branch starts clean.
 */
export function DueBackCard({ branch, business }: { branch: string | null; business: string }) {
  const t = useTranslations('reports.todo');
  const h = useTranslations('reports.todo.homeCard');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [stamp, setStamp] = useState(0);
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DUE_BACK_DESKTOP_QUERY);
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // A different branch is a different list: start clean, and never reopen the old sheet on the new people.
  useEffect(() => {
    setLoad({ state: 'loading' });
    setOpen(false);
  }, [branch]);

  useEffect(() => {
    if (!desktop) return;
    const refresh = () => setStamp((n) => n + 1);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    const timer = window.setInterval(refresh, DUE_BACK_REFRESH_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    let live = true;
    api
      .reportsTodo(branch)
      .then((todo) => live && setLoad({ state: 'ready', ...dueBackOf(todo) }))
      .catch(() => live && setLoad((prev) => (prev.state === 'ready' ? prev : { state: 'failed' })));
    return () => {
      live = false;
    };
  }, [branch, stamp, desktop]);

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
          <button type="button" onClick={() => {
              setLoad({ state: 'loading' });
              setStamp((n) => n + 1);
            }}>
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
