'use client';

import { useLocale, useTimeZone, useTranslations } from 'next-intl';

import { formatMoney, type ReportTodo, type ScorecardLine, type TodoCard } from '../lib/api';
import { intlLocale } from '../lib/format';
import { whatsappHref } from '../lib/receipt-text';
import { IconWhatsApp } from '../components/icons';
import { hourName, weekdayName } from './TodoTab';

/** How many to-dos the text carries. Two is a message; seven is a report. */
const TODOS = 2;

/**
 * Jira GRW-569 — "Share this week on WhatsApp".
 *
 * The scorecard's five lines and the top two to-dos, typed into a `wa.me`
 * link with no number: the owner picks who gets it — themselves, a partner,
 * a manager. Nothing is sent by the product. The words are the same keys the
 * screen uses, so the text and the screen can never disagree.
 */
export function ShareWeek({ data, business }: { data: ReportTodo; business: string }) {
  const t = useTranslations('reports.todo');
  const sc = useTranslations('reports.scorecard');
  const locale = useLocale();
  const timeZone = useTimeZone();
  const money = (minor: number) => formatMoney(String(minor), 'INR', locale);
  const period = sc('period.week');

  const sentence = (line: ScorecardLine, isMoney: boolean): string => {
    if (line.previous === null) return sc('noPrior');
    const diff = line.value - line.previous;
    if (diff === 0) return sc('same', { period });
    if (isMoney) return sc(diff > 0 ? 'moreMoney' : 'lessMoney', { amount: money(Math.abs(diff)), period });
    return sc(diff > 0 ? 'more' : 'fewer', { n: Math.abs(diff), period });
  };

  const day = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone }).format(new Date(iso));
  const lastDay = new Date(new Date(data.weekEndExclusiveISO).getTime() - 86_400_000).toISOString();

  const w = data.week;
  if (!w) return null;
  const lines = [
    `${sc('lines.money')} ${money(w.money.value)} — ${sentence(w.money, true)}`,
    `${sc('lines.visits')} ${w.visits.value} — ${sentence(w.visits, false)}`,
    `${sc('lines.newClients')} ${w.newClients.value} — ${sentence(w.newClients, false)}`,
    `${sc('lines.cameBack')} ${w.cameBack.value} — ${sentence(w.cameBack, false)}`,
    `${sc('lines.noShows')} ${w.noShows.value} — ${sentence(w.noShows, false)}`,
  ];

  const todos = data.cards
    .filter((c) => c.kind !== 'money')
    .slice(0, TODOS)
    .map((c) => `• ${cardTitle(c, t, locale)}`);

  const text = [
    t('share.heading', { business, from: day(data.weekStartISO), to: day(lastDay) }),
    ...lines,
    ...(todos.length > 0 ? ['', t('share.todo'), ...todos] : []),
  ].join('\n');

  return (
    <section className="rp-card td-card td-share">
      <div className="td-head"><h2 className="td-title">{t('share.title')}</h2></div>
      <p className="td-hint">{t('share.hint')}</p>
      <a className="btn td-action" href={whatsappHref('', text)} target="_blank" rel="noopener noreferrer">
        <IconWhatsApp />
        {t('share.button')}
      </a>
    </section>
  );
}

/** The sentence each card shows, for the text — the same key the screen renders. */
function cardTitle(card: TodoCard, t: ReturnType<typeof useTranslations<'reports.todo'>>, locale: string): string {
  switch (card.kind) {
    case 'dueBack':
    case 'stopped':
    case 'noShow':
    case 'unreachable':
      return t(`${card.kind}.title`, { n: card.count });
    case 'quietHours':
      return t('quietHours.title', {
        day: weekdayName(card.weekday, locale),
        from: hourName(card.fromHour, locale),
        to: hourName(card.toHour, locale),
      });
    case 'bestEarner':
      return t('bestEarner.title', { service: card.service });
    default:
      return '';
  }
}
