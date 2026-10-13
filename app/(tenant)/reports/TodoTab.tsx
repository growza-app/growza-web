'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatMoney, type ReportTodo, type TodoCard, type TodoClient } from '../lib/api';
import { whatsappHref } from '../lib/receipt-text';
import { IconCheck, IconWhatsApp } from '../components/icons';
import { MessageClientsSheet } from './MessageClientsSheet';

/**
 * What to do — the first Reports tab, and the only one that is not numbers.
 *
 * One sentence, one number and one button per card, with a dot that says
 * whether it is good news or work. No chart: the Numbers tabs have those,
 * and this screen is for an owner who will not read one. The people behind a
 * card open in a sheet with a WhatsApp button each, the message already
 * typed in the owner's language, sent from the owner's own phone.
 */
export function TodoTab({
  data,
  tenantName,
  onTab,
  onClient,
}: {
  data: ReportTodo;
  /** Named in the messages the owner sends. */
  tenantName: string;
  onTab: (tab: string) => void;
  /** Absent for a viewer the client card refuses — a row then opens nothing. */
  onClient?: (id: string) => void;
}) {
  const t = useTranslations('reports.todo');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState<'dueBack' | 'stopped' | 'noShow' | null>(null);

  const money = (minor: number) => formatMoney(String(minor), 'INR', locale);
  const text = (kind: 'dueBack' | 'stopped' | 'noShow', client: TodoClient) =>
    t(`${kind}.text`, { name: client.name, business: tenantName });

  const sheetCard = open ? data.cards.find((c) => c.kind === open) : undefined;
  const sheetClients = sheetCard && 'clients' in sheetCard ? sheetCard.clients : [];

  // Only the money card means the week was quiet all round.
  const nothingToDo = data.cards.length <= 1;

  return (
    <div className="rp-stack td-stack">
      {data.cards.map((card) => (
        <Card key={card.kind} card={card} money={money} locale={locale} t={t} onOpen={setOpen} onTab={onTab} router={router} business={tenantName} />
      ))}

      {nothingToDo && (
        <section className="rp-card td-empty">
          <span className="td-empty-icon"><IconCheck /></span>
          <h2>{t('empty')}</h2>
          <p className="rp-card-sub">{t('emptyHint')}</p>
        </section>
      )}

      <p className="td-foot">{t('checked')}</p>

      {open && sheetCard && 'count' in sheetCard && (
        <MessageClientsSheet
          title={t(`${open}.title`, { n: sheetCard.count })}
          clients={sheetClients}
          text={(client) => text(open, client)}
          onClose={() => setOpen(null)}
          onClient={onClient}
        />
      )}
    </div>
  );
}

type T = ReturnType<typeof useTranslations<'reports.todo'>>;

function Card({
  card,
  money,
  locale,
  t,
  onOpen,
  onTab,
  router,
  business,
}: {
  card: TodoCard;
  money: (minor: number) => string;
  locale: string;
  t: T;
  onOpen: (kind: 'dueBack' | 'stopped' | 'noShow') => void;
  onTab: (tab: string) => void;
  router: ReturnType<typeof useRouter>;
  business: string;
}) {
  const dot = <span className={`td-dot td-dot-${card.tone}`} role="img" aria-label={t(`tone.${card.tone}`)} />;

  if (card.kind === 'money') {
    const diff = card.previousMinor === null ? null : card.revenueMinor - card.previousMinor;
    return (
      <section className="rp-card td-card td-money">
        <div className="td-head">{dot}<h2 className="td-title">{t('money.title')}</h2></div>
        <div className="td-amount">{money(card.revenueMinor)}</div>
        <p className="td-hint">
          {diff === null
            ? t('money.first')
            : diff === 0
              ? t('money.same')
              : diff > 0
                ? t('money.more', { amount: money(diff) })
                : t('money.less', { amount: money(-diff) })}
          {' · '}
          {t('money.bookings', { n: card.bookings })}
        </p>
      </section>
    );
  }

  if (card.kind === 'dueBack' || card.kind === 'stopped' || card.kind === 'noShow') {
    const kind = card.kind;
    return (
      <section className="rp-card td-card">
        <div className="td-head">{dot}<h2 className="td-title">{t(`${kind}.title`, { n: card.count })}</h2></div>
        <p className="td-hint">{t(`${kind}.hint`)}</p>
        <button type="button" className="btn td-action" onClick={() => onOpen(kind)}>
          <IconWhatsApp />
          {t(`${kind}.button`)}
        </button>
      </section>
    );
  }

  if (card.kind === 'quietHours') {
    return (
      <section className="rp-card td-card">
        <div className="td-head">
          {dot}
          <h2 className="td-title">
            {t('quietHours.title', {
              day: weekdayName(card.weekday, locale),
              from: hourName(card.fromHour, locale),
              to: hourName(card.toHour, locale),
            })}
          </h2>
        </div>
        <p className="td-hint">{t('quietHours.hint')}</p>
        <button type="button" className="btn td-action" onClick={() => router.push('/offers')}>
          {t('quietHours.button')}
        </button>
      </section>
    );
  }

  if (card.kind === 'bestEarner') {
    return (
      <section className="rp-card td-card">
        <div className="td-head">{dot}<h2 className="td-title">{t('bestEarner.title', { service: card.service })}</h2></div>
        <p className="td-hint">{t('bestEarner.hint', { amount: money(card.revenueMinor) })}</p>
        <a
          className="btn td-action"
          href={whatsappHref('', t('bestEarner.text', { business, service: card.service }))}
          target="_blank"
          rel="noopener noreferrer"
        >
          <IconWhatsApp />
          {t('bestEarner.button')}
        </a>
      </section>
    );
  }

  // unreachable
  return (
    <section className="rp-card td-card">
      <div className="td-head">{dot}<h2 className="td-title">{t('unreachable.title', { n: card.count })}</h2></div>
      <p className="td-hint">{t('unreachable.hint', { optedOut: card.optedOut, noPhone: card.noPhone })}</p>
      <button type="button" className="btn btn-ghost td-action" onClick={() => onTab('customers')}>
        {t('unreachable.button')}
      </button>
    </section>
  );
}

/** "Tuesday" in the owner's language. 0 = Sunday, as the API counts. */
function weekdayName(weekday: number, locale: string): string {
  // 4 Jan 2026 is a Sunday.
  const d = new Date(Date.UTC(2026, 0, 4 + weekday, 12));
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(d);
}

/** "2 pm" in the owner's language. */
function hourName(hour: number, locale: string): string {
  const d = new Date(Date.UTC(2026, 0, 4, hour));
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(d);
}
