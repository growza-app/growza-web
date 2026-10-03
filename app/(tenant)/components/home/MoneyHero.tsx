'use client';

import { useEffect, useRef, useState } from 'react';
import type { HomeOverview, PaymentModeSlice } from '../../lib/api';
import type { HomeCopy } from '../../lib/home-copy';
import { IconChevronRight, IconDaySummary } from '../icons';
import { rupees } from './parts';
import { useDialog } from '../../../shared/a11y/useDialog';

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

/** The branch's dot on the money card: one colour per branch, in the order the API lists them. */
const BRANCH_DOT = ['#86efac', '#93c5fd', '#fcd34d', '#d8b4fe', '#fda4af'];

/**
 * Jira GRW-312 — how the money came in, on ONE line: "Cash ₹2,000 · UPI ₹900 · Card ₹360".
 *
 * A phone has no room for a bar and a row per method, and a bar at 100% cash
 * says nothing. One method reads "All cash ₹3,260"; more than three keep the
 * three biggest and a "+N" that opens the same list the ⋯ button does.
 */
export function planPaymentLine(slices: PaymentModeSlice[]): { shown: PaymentModeSlice[]; more: number; only: boolean } {
  const sorted = [...slices].sort((a, b) => b.revenueMinor - a.revenueMinor);
  const shown = sorted.slice(0, 3);
  return { shown, more: sorted.length - shown.length, only: sorted.length === 1 && sorted[0]!.mode !== 'not_recorded' };
}

export function PaymentLine({ t, slices, total, onMore }: { t: HomeCopy; slices: PaymentModeSlice[]; total: number; onMore: () => void }) {
  if (slices.length === 0 || total === 0) return <p className="hm-line hm-line-empty">{t.noMoneyYet}</p>;
  const { shown, more, only } = planPaymentLine(slices);
  return (
    <div className="hm-line" role="group" aria-label={t.howPaid}>
      {shown.map((s) => (
        <span key={s.mode} className="hm-line-item">
          <i style={{ background: MODE_COLOR[s.mode] }} />
          {only ? t.allPaidBy(t.payment[s.mode] ?? s.mode, s.mode) : t.payment[s.mode]} <b>{rupees(s.revenueMinor)}</b>
        </span>
      ))}
      {more > 0 ? (
        <button type="button" className="hm-line-more" aria-label={`${t.howPaid}: +${more}`} onClick={onMore}>
          +{more}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Jira GRW-312 — where the money was earned, over the period picked, on one line, for a business with
 * branches. Two branches fit; more show the two earning most and a "+N" that
 * opens the branch list. A tap on a name picks that branch, as the list does.
 */
function BranchLine({
  t,
  branches,
  onPick,
  onMore,
}: {
  t: HomeCopy;
  branches: HomeOverview['branches'];
  onPick: (id: string) => void;
  onMore: () => void;
}) {
  const ranked = branches.map((b, i) => ({ b, colour: BRANCH_DOT[i % BRANCH_DOT.length]! })).sort((x, y) => y.b.revenueMinor - x.b.revenueMinor);
  const shown = branches.length > 2 ? ranked.slice(0, 2) : ranked;
  const more = branches.length - shown.length;
  return (
    <div className="hm-line hm-line-branches" role="group" aria-label={t.yourBranches}>
      {shown.map(({ b, colour }) => (
        <button key={b.id} type="button" className="hm-line-item hm-line-pick" onClick={() => onPick(b.id)}>
          <i style={{ background: colour }} />
          <span className="hm-line-name">{b.name}</span> <b>{rupees(b.revenueMinor)}</b>
        </button>
      ))}
      {more > 0 ? (
        <button type="button" className="hm-line-more" aria-label={`${t.yourBranches}: +${more}`} onClick={onMore}>
          +{more}
        </button>
      ) : null}
    </div>
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

export function MoneyHero({
  t,
  data,
  loading,
  onDaySummary,
  branchId = null,
  onPickBranch,
  onMoreBranches,
}: {
  t: HomeCopy;
  data: HomeOverview;
  loading: boolean;
  onDaySummary?: () => void;
  /** The branch picked above the card; null is all of them. */
  branchId?: string | null;
  onPickBranch?: (id: string) => void;
  onMoreBranches?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Jira GRW-342 — a popover: focus moves in, Escape closes and returns to the ⋯ button, Tab past the end closes it.
  useDialog(menuRef, { onClose: () => setMenu(false), active: menu, trapTab: false });
  // Nothing to pick in this menu any more, so a tap anywhere else closes it.
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.parentElement?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  const { money, week } = data;
  const eyebrow = money.period === 'today' ? t.moneyToday : money.period === 'week' ? t.moneyWeek : t.moneyMonth;
  const vs = money.period === 'today' ? t.vsYesterday : money.period === 'week' ? t.vsLastWeek : t.vsLastMonth;
  const deltaChip = (className: string, hideWords: boolean) =>
    money.deltaPct !== null && money.revenueMinor > 0 ? (
      <span className={`${className} ${money.deltaPct >= 0 ? 'up' : 'down'}`}>
        {money.deltaPct >= 0 ? '↑' : '↓'} {Math.abs(money.deltaPct)}% <span className={hideWords ? 'hm-desktop-inline' : 'hm-chip-words'}>{vs}</span>
      </span>
    ) : null;
  const branches = data.branches;
  const showBranchLine = branches.length > 1 && branchId === null && Boolean(onPickBranch && onMoreBranches);

  return (
    <section className={`hm-hero ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
      <div className="hm-hero-top">
        <span className="hm-eyebrow">{eyebrow}</span>
        {/* BR-08 — no badge when there is nothing to compare with, and none
            until something has come in: "↓ 100%" at 9 am is not news, it is
            the time of day. */}
        {deltaChip('hm-delta hm-delta-top', true)}
        {/*
          Jira GRW-270 · GRW-275 — how the money came in, as a list with the
          rupees and the share of each. Jira GRW-394 — opened only from the
          payment line's "+N" now: the ⋯ button that also opened it repeated
          the split the line under the amount already shows (owner, 2026-09-25).
        */}
        {menu ? (
          <div ref={menuRef} className="hm-menu hm-pay-menu" role="dialog" aria-label={t.howPaid}>
            <div className="hm-pay-menu-head">
              <strong>{t.howPaid}</strong>
              <span>{rupees(money.revenueMinor)}</span>
            </div>
            <PaymentBar t={t} slices={money.byPaymentMode} total={money.revenueMinor} variant="list" />
          </div>
        ) : null}
      </div>

      <div className="hm-hero-body">
        <div className="hm-hero-main">
          <div className="hm-hero-amount">{rupees(money.revenueMinor)}</div>
          {deltaChip('hm-delta hm-hero-chip hm-mobile-inline', false)}
          <div className="hm-hero-stats">
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

      {/*
        Jira GRW-312 — the phone card, in words: where the money was earned and how it was
        paid, each on one line, and no graph. From 861px the card is the laptop's, unchanged,
        and this block is not drawn.

        Jira GRW-486 — "N not marked done" is no longer the first line of it. "Needs your
        attention" is on the phone now, directly below this card, and it carries that same
        count beside the other two. One fact in two places 200px apart is one too many, and
        the card that states it is the one you can act from.
      */}
      <div className="hm-hero-phone hm-mobile">
        {showBranchLine ? <BranchLine t={t} branches={branches} onPick={onPickBranch!} onMore={onMoreBranches!} /> : null}
        <PaymentLine t={t} slices={money.byPaymentMode} total={money.revenueMinor} onMore={() => setMenu(true)} />
        {money.period === 'today' ? (
          <p className="hm-line-foot">
            {t.thisWeek} <b>{rupees(week.revenueMinor)}</b>
          </p>
        ) : null}
      </div>

      {/* Jira GRW-270 · GRW-275 — the split under the amount on a laptop; a phone has the one line above. */}
      <div className="hm-hero-pay hm-desktop">
        <PaymentBar t={t} slices={money.byPaymentMode} total={money.revenueMinor} variant="tiles" />
      </div>

      {/* Jira GRW-306 — the Day summary, in words, for 861–1180px. From 1181px the header
          button has room for its label; on a phone it is the icon beside the branch picker. */}
      {onDaySummary ? (
        <button type="button" className="hm-hero-summary" onClick={onDaySummary}>
          <IconDaySummary />
          <span>{t.daySummary}</span>
          <IconChevronRight />
        </button>
      ) : null}
    </section>
  );
}
