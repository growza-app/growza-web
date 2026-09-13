'use client';

import { useState } from 'react';
import type { HomeOverview, PaymentModeSlice } from '../../lib/api';
import type { HomeCopy } from '../../lib/home-copy';
import { IconDots } from '../icons';
import { rupees } from './parts';

/**
 * Jira GRW-222 — the money card.
 *
 * Every figure here arrives from `/api/v1/home`, which reads Reports' own
 * calculations; nothing is added up in the browser except the percentages of a
 * split whose parts the server already summed to the total.
 */

const MODE_COLOR: Record<string, string> = {
  upi: '#5eead4',
  cash: '#fcd34d',
  card: '#93c5fd',
  other: '#d8b4fe',
  not_recorded: '#cbd5e1',
};

export function PaymentBar({ t, slices, total, variant }: { t: HomeCopy; slices: PaymentModeSlice[]; total: number; variant: 'tiles' | 'inline' | 'list' }) {
  if (slices.length === 0 || total === 0) return <p className={variant === 'list' ? 'hm-empty' : 'hm-hero-empty'}>{t.noMoneyYet}</p>;
  const share = (n: number) => Math.round((n / total) * 100);
  return (
    <>
      <div className="hm-paybar" aria-hidden>
        {slices.map((s) => (
          <span key={s.mode} style={{ width: `${(s.revenueMinor / total) * 100}%`, background: MODE_COLOR[s.mode] }} />
        ))}
      </div>
      <div className={`hm-pay hm-pay-${variant}`}>
        {slices.map((s) => (
          <div key={s.mode} className="hm-pay-item">
            <span className="hm-pay-label">
              <i style={{ background: MODE_COLOR[s.mode] }} />
              {t.payment[s.mode]}
            </span>
            <span className="hm-pay-value">{rupees(s.revenueMinor)}</span>
            <span className="hm-pay-share">{share(s.revenueMinor)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Sparkline({ days }: { days: HomeOverview['week']['days'] }) {
  const shown = days.filter((d) => !d.future);
  const max = Math.max(...days.map((d) => d.revenueMinor), 1);
  const x = (i: number) => 4 + (i * 192) / Math.max(days.length - 1, 1);
  const y = (v: number) => 36 - (v / max) * 30;
  const points = shown.map((d, i) => `${x(i)},${y(d.revenueMinor)}`).join(' ');
  const last = shown.at(-1);
  return (
    <div className="hm-spark">
      <svg viewBox="0 0 200 42" preserveAspectRatio="none" role="img" aria-label={days.map((d) => `${d.weekday} ${rupees(d.revenueMinor)}`).join(', ')}>
        {shown.length > 1 ? <polyline points={points} /> : null}
        {last ? <circle cx={x(shown.length - 1)} cy={y(last.revenueMinor)} r="3.5" /> : null}
      </svg>
      <div className="hm-spark-days">
        {/* A week: M T W T F S S. A month: every seventh date, spaced to where it falls. */}
        {days.map((d, i) =>
          d.weekday ? (
            <span key={d.date} style={{ left: `${(x(i) / 200) * 100}%` }}>
              {/^\d/.test(d.weekday) ? d.weekday : d.weekday.charAt(0)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

export function MoneyHero({ t, data, loading }: { t: HomeCopy; data: HomeOverview; loading: boolean }) {
  const [view, setView] = useState<'total' | 'methods'>('total');
  const [menu, setMenu] = useState(false);
  const { money, week } = data;
  const eyebrow = money.period === 'today' ? t.moneyToday : money.period === 'week' ? t.moneyWeek : t.moneyMonth;
  const vs = money.period === 'today' ? t.vsYesterday : money.period === 'week' ? t.vsLastWeek : t.vsLastMonth;

  return (
    <section className={`hm-hero ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
      <div className="hm-hero-top">
        <span className="hm-eyebrow">{eyebrow}</span>
        {/* BR-08 — no badge when there is nothing to compare with, and none
            until something has come in: "↓ 100%" at 9 am is not news, it is
            the time of day. */}
        {money.deltaPct !== null && money.revenueMinor > 0 ? (
          <span className={`hm-delta ${money.deltaPct >= 0 ? 'up' : 'down'}`}>
            {money.deltaPct >= 0 ? '↑' : '↓'} {Math.abs(money.deltaPct)}% <span className="hm-desktop-inline">{vs}</span>
          </span>
        ) : null}
        <button type="button" className="hm-hero-menu hm-mobile-inline" aria-label={t.moneyMenu} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          <IconDots />
        </button>
        {menu ? (
          <div className="hm-menu" role="menu">
            <button type="button" role="menuitemradio" aria-checked={view === 'total'} onClick={() => (setView('total'), setMenu(false))}>
              {t.allMoney}
            </button>
            <button type="button" role="menuitemradio" aria-checked={view === 'methods'} onClick={() => (setView('methods'), setMenu(false))}>
              {t.howPaid}
            </button>
          </div>
        ) : null}
      </div>

      <div className="hm-hero-body">
        <div className="hm-hero-main">
          <div className="hm-hero-amount">{rupees(money.revenueMinor)}</div>
          <div className={`hm-hero-stats ${view === 'methods' ? 'hm-desktop-flex' : ''}`}>
            <span>
              <strong>{money.bookings}</strong> {t.bookingWord(money.bookings)}
            </span>
            <span>
              <strong>{money.newCustomers}</strong> {t.newClientWord(money.newCustomers)}
            </span>
            {money.cameBackPct !== null ? (
              <span>
                <strong>{money.cameBackPct}%</strong> {t.cameBack}
              </span>
            ) : null}
          </div>
        </div>
        <div className="hm-hero-week">
          <span className="hm-eyebrow">{week.span === 'month' ? t.thisMonth : t.thisWeek}</span>
          <strong>{rupees(week.revenueMinor)}</strong>
          <Sparkline days={week.days} />
        </div>
      </div>

      {/* Phones pick totals OR the split from the ⋯ menu; laptops always have room for both. */}
      <div className={`hm-hero-pay ${view === 'total' ? 'hm-desktop' : ''}`}>
        <PaymentBar t={t} slices={money.byPaymentMode} total={money.revenueMinor} variant="tiles" />
      </div>
    </section>
  );
}
