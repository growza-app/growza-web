'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { CustomerGrowth, GrowthPerson } from '../lib/api-types';
import { formatMoney, intlLocale } from '../lib/format';
import { IconWhatsApp } from '../components/icons';
import { Avatar } from '../components/home/parts';
import { useSession } from '../components/SessionProvider';
import { whatsappHref } from '../lib/receipt-text';
import { todayInZone } from '../lib/report-dates';
import { useMessaged } from './messaged';
import { growthMessage, type GrowthKind } from './growth-messages';

/** Five people, then "See all" (up to the twenty the API sends), as every list on this tab. */
const SHOWN = 5;

/**
 * Owner, 2026-11-28 — "add more cards which can help the business grow", then "build it": three lists on Reports ›
 * Customers, each a person to message from the owner's own WhatsApp. Counted back from today, not the dates picked.
 *
 *   Bought once, not back           — a second visit is where a shop grows
 *   Top customers spending less     — a loss seen before it is one
 *   Bought at this time last year   — the season comes round again (absent in a shop's first year)
 *
 * A list with nobody on it is not drawn. Someone who may not see customers is sent the counts alone, and sees those.
 */
export function GrowthLists({ growth }: { growth: CustomerGrowth }) {
  const t = useTranslations('customerGrowth');
  const locale = useLocale();
  const money = (minor: number) => formatMoney(Math.round(minor / 100) * 100, 'INR', locale);
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const asDay = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
  const season = growth.lastYearNow;
  return (
    <>
      {growth.boughtOnce.count > 0 ? (
        <Growth
          id="once"
          kind="once"
          title={t('onceTitle')}
          sub={t('onceSub')}
          count={growth.boughtOnce.count}
          rows={growth.boughtOnce.rows.map((r) => ({ ...r, note: t('onceNote', { n: r.daysAgo }), value: money(r.salesMinor) }))}
        />
      ) : null}
      {growth.spendingLess.count > 0 ? (
        <Growth
          id="less"
          kind="less"
          title={t('lessTitle')}
          sub={t('lessSub')}
          count={growth.spendingLess.count}
          rows={growth.spendingLess.rows.map((r) => ({
            ...r,
            note: t('lessNote', { before: money(r.beforeMinor), now: money(r.nowMinor) }),
            value: t('lessValue', { pct: r.dropPct }),
          }))}
        />
      ) : null}
      {season && season.count > 0 ? (
        <Growth
          id="season"
          kind="season"
          title={t('seasonTitle')}
          sub={t('seasonSub', { from: asDay(season.from), to: asDay(season.to) })}
          count={season.count}
          rows={season.rows.map((r) => ({ ...r, note: t('seasonNote', { day: asDay(r.lastYearDay) }), value: money(r.lastYearMinor) }))}
        />
      ) : null}
    </>
  );
}

type Row = GrowthPerson & { note: string; value: string };

function Growth({ id, kind, title, sub, count, rows }: { id: string; kind: GrowthKind; title: string; sub: string; count: number; rows: Row[] }) {
  const t = useTranslations('customerGrowth');
  const [all, setAll] = useState(false);
  const session = useSession();
  const messaged = useMessaged(todayInZone(session?.timezone));
  const message = growthMessage(kind, session?.businessName);
  const headId = `rr-growth-${id}-h`;
  const heading = (
    <h3 className="rr-list-title" id={headId}>
      {title} <span className="rr-list-count">· {count}</span>
    </h3>
  );
  if (rows.length === 0) {
    return (
      <section className="rr-list" aria-labelledby={headId}>
        {heading}
        <p className="rr-line">{t('count', { n: count })}</p>
      </section>
    );
  }
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    // The overdue list's layout (rr-overdue): name and note, the figure under them on a phone, the round WhatsApp button.
    <section className={`rr-list rr-people rr-overdue rr-growth rr-growth-${id}`} aria-labelledby={headId}>
      {heading}
      <p className="rr-more rr-overdue-sub">{sub}</p>
      <ul>
        {shown.map((r) => (
          <li key={r.customerId}>
            <Avatar name={r.name} id={r.customerId} size={36} />
            <span className="rr-list-name">
              {r.name ?? t('hidden')}
              <span className="rr-list-note">{r.note}</span>
            </span>
            <span className="rr-away">{r.value}</span>
            <a
              className="rr-wa"
              href={whatsappHref(r.phone.replace(/\D/g, ''), message)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('waAria', { name: r.name ?? t('hidden') })}
              onClick={() => messaged.mark(r.phone)}
            >
              <IconWhatsApp />
            </a>
          </li>
        ))}
      </ul>
      {!all && rows.length > SHOWN ? (
        <button type="button" className="btn btn-ghost rr-see-all" onClick={() => setAll(true)}>
          {t('seeAll', { n: count })}
        </button>
      ) : null}
      {all && count > rows.length ? <p className="rr-more">{t('more', { n: count - rows.length })}</p> : null}
    </section>
  );
}
