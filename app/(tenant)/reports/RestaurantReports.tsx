'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import AppLink from '../../shared/AppLink';
import { api } from '../lib/api';
import type {
  FoodCostReportPage,
  RestaurantCancelledPage,
  RestaurantCompared,
  RestaurantCustomersPage,
  RestaurantDishFans,
  RestaurantPointsWaiting,
  RestaurantFreshness,
  RestaurantDish,
  RestaurantItemsPage,
  RestaurantOverviewPage,
  RestaurantSalesPage,
  RestaurantTipsPage,
  TipCard,
} from '../lib/api-types';
import { formatMoney, intlLocale } from '../lib/format';
import { IconChevronRight, IconClock, IconCutlery, IconLightbulb, IconWhatsApp } from '../components/icons';
import { whatsappHref } from '../lib/receipt-text';
import { Avatar } from '../components/home/parts';
import { useBranch } from '../components/BranchProvider';
import { useMayOpen, useSession } from '../components/SessionProvider';
import { ReportDates } from './ReportDates';
import { RESTAURANT_TABS, type RestaurantTab } from './restaurant-tabs';
import { MissYouSheet } from './MissYouSheet';
import { missYouIn } from './miss-you';
import { PointsSheet } from './PointsSheet';
import { GuestMessageSheet, sheetLabels } from './GuestMessageSheet';
import { dishFansTemplate, fanDish } from './dish-fans';
import { pointsFor, pointsNumber, pointsTemplate, rupees as pointsRupees, shortDay } from './points-reminder';
import { useMessaged } from './messaged';
import { type CustomerWords, useCustomersWords, useFansWords, usePointsWords } from './customer-words';
import { fetchOnce, freshFor, isFresh, peek } from './report-cache';
import { type ChangedEnd, clampReportRange, defaultReportRange, todayInZone } from '../lib/report-dates';

export type { RestaurantTab };

/**
 * Jira GRW-758 — the restaurant's Reports, in simple tabs: Overview · Sales · Items · Inventory.
 *
 * Owner rule, 2026-11-24 — "very clean and precise, not too much noise", in easy English:
 *   - each tab is ONE big number, at most three small figures, one chart and lists of five;
 *   - each fact appears once across the tabs;
 *   - a row or figure that is zero or empty is left out, not drawn as "₹0";
 *   - under a figure, one line only ("↑ 8% vs the days before"); no sentences, no advice (advice is the Tips tab's);
 *   - exact rupees, Indian commas, whole-number percentages.
 * The API sends figures only; every word is written here, in English or Hindi.
 */


type Money = (minor: number | null) => string;

/** Owner rule — exact rupees, Indian commas, no paise: every amount on these tabs, the same rounding everywhere. */
export const rupees = (minor: number | null, locale: string) => formatMoney(minor === null ? null : Math.round(minor / 100) * 100, 'INR', locale);

/** The ways of paying and of eating the screen has words for; anything else is shown as the API names it. */
const MODE_WORDS = { cash: 'mode.cash', upi: 'mode.upi', card: 'mode.card', other: 'mode.other', not_recorded: 'mode.not_recorded' } as const;
const TYPE_WORDS = { dine_in: 'type.dine_in', takeaway: 'type.takeaway', delivery: 'type.delivery', counter: 'type.counter' } as const;
/** Owner, 2026-11-24 — a delivery app is a source of its own in "Where sales came from". */
/** A list shows five rows; "See all" opens the rest (owner rule, 2026-11-24). */
const LIST_SHOWN = 5;
const SOURCE_WORDS = { swiggy: 'source.swiggy', zomato: 'source.zomato', other: 'source.other' } as const;

/** One line under a figure: up, down, the same — or nothing when there is nothing to compare with. */
type DeltaWords = (key: 'delta.up' | 'delta.down' | 'delta.same', values?: { pct: number }) => string;
type FreshWords = (key: 'freshness', values: { when: string }) => string;

export function Delta({ c, t }: { c: RestaurantCompared; t: DeltaWords }) {
  if (c.changePct === null) return null;
  const pct = Math.round(Math.abs(c.changePct));
  if (pct === 0) return <p className="rr-delta">{t('delta.same')}</p>;
  const up = c.changePct > 0;
  return <p className={`rr-delta ${up ? 'is-up' : 'is-down'}`}>{t(up ? 'delta.up' : 'delta.down', { pct })}</p>;
}

/**
 * A bar for each point, its amount on top. More than 8 points: only the best one (and today) carries its amount.
 * Owner rule — exact to the rupee: a laptop shows the exact amount; only a phone, where seven "₹35,085" do not fit,
 * shortens it to "₹35k" (CSS picks one of the two). Today, still under way, is drawn as an outline and named "Today".
 */
/** The top of the scale: the best day rounded up to a round step (1, 2, 2.5 or 5 × a power of ten) times four. */
export function scale(peak: number, lines = 4): { top: number; step: number } {
  if (peak <= 0) return { top: 0, step: 0 };
  const raw = peak / lines;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => x >= raw)!;
  return { top: step * lines, step };
}

/** "₹40k", "₹2.5k", "₹1.5L", "₹800" — an axis line's name; the exact amount is on the bar. */
export function axisAmount(minor: number, money: Money): string {
  const rupee = minor / 100;
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (rupee >= 100_000) return `₹${trim(rupee / 100_000)}L`;
  if (rupee >= 1_000) return `₹${trim(rupee / 1_000)}k`;
  return money(minor);
}

export function Bars({ points, money, label, today }: { points: Array<{ key: string; tick: string; full: string; minor: number; weekend?: boolean }>; money: Money; label: string; today?: { key: string; word: string } }) {
  const peak = Math.max(0, ...points.map((p) => p.minor));
  const best = points.findIndex((p) => p.minor === peak && peak > 0);
  const { top, step } = scale(peak);
  const short = (minor: number) => (minor >= 1_000_000 ? `₹${Math.round(minor / 100_000)}k` : money(minor));
  // The scale, top line first; the bottom line is ₹0.
  const lines = top === 0 ? [] : [4, 3, 2, 1, 0].map((n) => n * step);
  return (
    <div className="rr-chart">
      <ul className="cr-bars cr-bars-day rr-bars" aria-label={label}>
        {/* The scale (Y) is the first column, built like the others — the same space above and below its drawing
            area — so each amount sits on its line whatever the fonts measure. */}
        {lines.length ? (
          <li className="cr-bar-col rr-ycol" aria-hidden="true">
            <span className="cr-bar-top" />
            <span className="cr-bar-slot">
              {lines.map((v) => (
                <span key={v} className="rr-yline">
                  {axisAmount(v, money)}
                </span>
              ))}
            </span>
            <span className="cr-bar-tick" />
          </li>
        ) : null}
        {points.map((p, i) => {
          const isToday = p.key === today?.key;
          return (
            <li key={p.key} className={`cr-bar-col${isToday ? ' is-today' : ''}${p.weekend ? ' is-weekend' : ''}`}>
              {/* Only the best day and today carry their amount: the scale on the left reads the rest. */}
              <span className={`cr-bar-top${i === best ? ' is-peak' : ''}`} aria-hidden="true">
                {i === best || isToday ? (
                  <>
                    <span className="rr-amt-short">{short(p.minor)}</span>
                    <span className="rr-amt-full">{money(p.minor)}</span>
                  </>
                ) : (
                  ''
                )}
              </span>
              <span className="cr-bar-slot">
                <span className={`cr-bar${i === best ? ' is-peak' : ''}`} style={{ height: `${top === 0 || p.minor <= 0 ? 0 : Math.max(2, (p.minor / top) * 100)}%` }} />
              </span>
              <span className="cr-bar-tick" aria-hidden="true">{isToday ? today!.word : p.tick}</span>
              <span className="sr-only">
                {p.full} {money(p.minor)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Owner, 2026-11-25 — which hours the busy-times axis names. It named every third hour AND always the last, so once
 * late-night bills stretched the day to all 24 hours, 9 pm and 11 pm printed on top of each other ("91pm") and 12 am ran
 * into 3 am on a phone. Now one step throughout, counted from the first hour: every 3rd hour, every 4th past 15 hours.
 * The last hour is named only when it falls on a step; every bar still says its hour to a screen reader.
 */
export function namedHour(first: number, last: number): (h: number) => boolean {
  const step = last - first > 15 ? 4 : 3;
  return (h) => (h - first) % step === 0;
}

/** A small figure: its name, its amount. */
export function Small({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rr-small">
      <p className="rr-small-label">{label}</p>
      <p className="rr-small-value">{value}</p>
      {sub ? <p className="rr-small-sub">{sub}</p> : null}
    </div>
  );
}

/** A list of up to five rows: a name and an amount. */
export function List({
  title,
  sub,
  rows,
  more,
}: {
  title: string;
  /** Owner, 2026-11-24 — one line under the title saying what the list counts. */
  sub?: string | null;
  rows: Array<{ key: string; name: string; value: string; note?: string | null; tone?: 'up' | 'down' | 'quiet' }>;
  more?: string | null;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="rr-list" aria-label={title}>
      <h3 className="rr-list-title">{title}</h3>
      {sub ? <p className="rr-more rr-list-sub">{sub}</p> : null}
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            <span className="rr-list-name">
              {r.name}
              {r.note ? <span className="rr-list-note">{r.note}</span> : null}
            </span>
            <span className={`rr-list-value${r.tone ? ` is-${r.tone}` : ''}`}>{r.value}</span>
          </li>
        ))}
      </ul>
      {more ? <p className="rr-more">{more}</p> : null}
    </section>
  );
}

function Freshness({ f, t, locale }: { f: RestaurantFreshness; t: FreshWords; locale: string }) {
  if (!f.builtAt) return null;
  const when = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(f.builtAt));
  return <p className="rr-fresh">{t('freshness', { when })}</p>;
}

/**
 * Owner, 2026-11-24 — "what if someone has not added the cost price?" Profit is worked out only over dishes with a cost
 * price, so the figure says what it covers. No dish with one: no figure at all (a ₹0 profit reads as a bad month), and
 * the way to fix it. Some: the figure, the sales it is over, and how many dishes have none. Never an estimate.
 */
function ProfitFigure({ p, money }: { p: NonNullable<RestaurantOverviewPage['profit']>; money: Money }) {
  const t = useTranslations('restaurantReports');
  const mayOpen = useMayOpen();
  const fix = '/stock?show=noCost';
  const missing = p.missingDishes ?? 0;
  const missingWords = t('overview.missingDishes', { n: missing });
  const missingLine = missing > 0 ? (mayOpen(fix) ? <AppLink className="rr-fix" href={fix}>{missingWords}</AppLink> : missingWords) : null;
  if (p.profitMinor === null) {
    return <Small label={t('overview.profit')} value={<span className="rr-none">{t('overview.noCostYet')}</span>} sub={missingLine} />;
  }
  const lines = [
    p.uncostedSalesMinor > 0 && p.costedSalesMinor !== undefined && p.salesMinor !== undefined
      ? t('overview.profitOn', { part: money(p.costedSalesMinor), all: money(p.salesMinor) })
      : null,
    missingLine,
    (p.thrownMinor ?? 0) > 0 ? t('overview.thrown', { amount: money(p.thrownMinor!) }) : null,
  ].filter((x) => x !== null && x !== '');
  return (
    <Small
      label={t('overview.profit')}
      value={money(p.profitMinor)}
      sub={lines.length ? lines.map((l, i) => <span key={i} className="rr-sub-line">{l}</span>) : null}
    />
  );
}

/* ───────────────────────────── Overview ───────────────────────────── */

export function OverviewTab({
  data,
  todayISO,
  tipCount = null,
  onOpen,
}: {
  data: RestaurantOverviewPage;
  todayISO?: string;
  /** How many tips this week; null while unread, or when the Tips tab cannot be opened. */
  tipCount?: number | null;
  onOpen?: (tab: RestaurantTab) => void;
}) {
  const t = useTranslations('restaurantReports');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.sales.value === 0 && data.bills.value === 0) return <p className="rr-empty">{t('empty')}</p>;
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dateOnly = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', timeZone: 'UTC' });
  const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
  // The first and last day carry the month; up to 8 days, the days between carry their date alone ("19"). Seven
  // "19 Nov"s are wider than a 344px card and ran into each other. Longer, one name a week counted back from
  // the last day ("17 Nov"), never within three days of the first.
  const last = data.byDay.length - 1;
  const points = data.byDay.map((d, i) => ({
    key: d.day,
    tick: i === 0 || i === last ? day.format(asDate(d.day)) : data.byDay.length <= 8 ? dateOnly.format(asDate(d.day)) : (last - i) % 7 === 0 && i >= 3 ? day.format(asDate(d.day)) : '',
    full: weekday.format(asDate(d.day)),
    minor: d.salesMinor,
    weekend: [0, 6].includes(asDate(d.day).getUTCDay()),
  }));
  const both = points.some((p) => p.weekend) && points.some((p) => !p.weekend);
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="rr-sales-h">
        <div className="rr-lead">
          <h2 className="cr-label" id="rr-sales-h">{t('overview.sales')}</h2>
          <p className="cr-hero">{money(data.sales.value)}</p>
          <Delta c={data.sales} t={t} />
        </div>
        <div className="rr-smalls">
          <Small label={t('overview.bills')} value={data.bills.value.toLocaleString(intlLocale(locale))} />
          {data.averageBillMinor.value !== null ? <Small label={t('overview.average')} value={money(data.averageBillMinor.value)} /> : null}
          {data.profit ? <ProfitFigure p={data.profit} money={money} /> : null}
        </div>
        <Bars points={points} money={money} label={t('overview.byDay')} today={todayISO ? { key: todayISO, word: t('overview.today') } : undefined} />
        {both ? (
          <p className="rr-legend" aria-hidden="true">
            <span className="rr-key">{t('overview.weekdays')}</span>
            <span className="rr-key is-weekend">{t('overview.weekend')}</span>
          </p>
        ) : null}
      </section>
      <OverviewMore data={data} tipCount={tipCount} onOpen={onOpen} money={money} />
      <Freshness f={data.freshness} t={t} locale={locale} />
    </>
  );
}

/**
 * Owner, 2026-11-24 — under the chart: "Where sales came from" (moved here from the Sales tab) and "Worth a look", three
 * one-line highlights that each open their tab. A source split is drawn only with two sources or more (a takeaway-only
 * kitchen with no app has nothing to split); a highlight with nothing to say is left out.
 */
function OverviewMore({ data, tipCount, onOpen, money }: { data: RestaurantOverviewPage; tipCount: number | null; onOpen?: (tab: RestaurantTab) => void; money: Money }) {
  const t = useTranslations('restaurantReports');
  const locale = useLocale();
  const all = (data.sources ?? []).filter((x) => x.salesMinor > 0);
  const total = all.reduce((n, x) => n + x.salesMinor, 0);
  // Five parts at most: a sixth source and beyond are added up as "Other".
  const parts = all.length > 5 ? [...all.slice(0, 4), { key: 'other', salesMinor: all.slice(4).reduce((n, x) => n + x.salesMinor, 0) }] : all;
  const sourceName = (key: string) =>
    key in TYPE_WORDS ? t(TYPE_WORDS[key as keyof typeof TYPE_WORDS]) : key in SOURCE_WORDS ? t(SOURCE_WORDS[key as keyof typeof SOURCE_WORDS]) : key.charAt(0).toUpperCase() + key.slice(1);
  const hour = new Intl.DateTimeFormat(intlLocale(locale), { hour: 'numeric', timeZone: 'UTC' });
  const hourName = (h: number) => hour.format(new Date(Date.UTC(2026, 0, 5, h % 24)));
  const rows: Array<{ key: string; tab: RestaurantTab; icon: ReactNode; main: string; sub: string }> = [];
  if (data.topDish) {
    rows.push({
      key: 'dish',
      tab: 'items',
      icon: <IconCutlery />,
      main: t('overview.topDish', { name: data.topDish.name }),
      sub: t('overview.topDishSub', { n: data.topDish.qty, amount: money(data.topDish.salesMinor) }),
    });
  }
  if (data.busiest) {
    rows.push({
      key: 'busy',
      tab: 'sales',
      icon: <IconClock />,
      main: t('overview.busiest', { from: hourName(data.busiest.hour), to: hourName(data.busiest.hour + 1) }),
      sub: t('overview.busiestSub', { n: data.busiest.bills, pct: data.busiest.sharePct }),
    });
  }
  if (tipCount !== null && tipCount > 0) {
    rows.push({ key: 'tips', tab: 'tips', icon: <IconLightbulb />, main: t('overview.tips', { n: tipCount }), sub: t('overview.tipsSub') });
  }
  if (parts.length < 2 && rows.length === 0) return null;
  return (
    <div className="rr-lists rr-more-cards">
      {parts.length >= 2 ? (
        <section className="rr-list rr-sources" aria-labelledby="rr-sources-h">
          <h3 className="rr-list-title" id="rr-sources-h">{t('overview.sources')}</h3>
          <div className="rr-split" aria-hidden="true">
            {parts.map((x) => (
              <span key={x.key} className={`rr-split-part rr-src-${x.key}`} style={{ flexGrow: x.salesMinor }} />
            ))}
          </div>
          <ul>
            {parts.map((x) => (
              <li key={x.key}>
                <span className="rr-list-name rr-source-name">
                  <span className={`rr-split-dot rr-src-${x.key}`} aria-hidden="true" />
                  {sourceName(x.key)}
                </span>
                <span className="rr-list-value">
                  {money(x.salesMinor)} · {total > 0 ? Math.round((x.salesMinor / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {rows.length > 0 ? (
        <section className="rr-list rr-worth" aria-labelledby="rr-worth-h">
          <h3 className="rr-list-title" id="rr-worth-h">{t('overview.worth')}</h3>
          <ul>
            {rows.map((r) => {
              const inner = (
                <>
                  <span className="rr-worth-icon" aria-hidden="true">{r.icon}</span>
                  <span className="rr-worth-text">
                    <span className="rr-worth-main">{r.main}</span>
                    <span className="rr-worth-sub">{r.sub}</span>
                  </span>
                </>
              );
              return (
                <li key={r.key}>
                  {onOpen ? (
                    <button
                      type="button"
                      className="rr-worth-row"
                      onClick={(e) => {
                        // The row is at the foot of the page: the tab it opens is read from its top. The page scrolls
                        // inside `.page-body` (use-fit-rows.ts), not the window.
                        const scroller = e.currentTarget.closest('.page-body');
                        onOpen(r.tab);
                        (scroller ?? window).scrollTo({ top: 0 });
                      }}
                    >
                      {inner}
                      <span className="rr-worth-go" aria-hidden="true"><IconChevronRight /></span>
                    </button>
                  ) : (
                    <div className="rr-worth-row">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── Sales ───────────────────────────── */

export function SalesTab({ data }: { data: RestaurantSalesPage }) {
  const t = useTranslations('restaurantReports');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.moneyIn.value === 0 && data.byOrderType.length === 0) return <p className="rr-empty">{t('empty')}</p>;
  const hour = new Intl.DateTimeFormat(intlLocale(locale), { hour: 'numeric', timeZone: 'UTC' });
  const hourName = (h: number) => hour.format(new Date(Date.UTC(2026, 0, 5, h)));
  const sold = data.busyHours.filter((h) => h.salesMinor > 0);
  const first = sold.length ? sold[0]!.hour : 0;
  const last = sold.length ? sold[sold.length - 1]!.hour : -1;
  const by = new Map(data.busyHours.map((h) => [h.hour, h.salesMinor]));
  const hourNamed = namedHour(first, last);
  const points = [];
  for (let h = first; h <= last; h++) points.push({ key: String(h), tick: hourNamed(h) ? hourName(h) : '', full: hourName(h), minor: by.get(h) ?? 0 });
  const named = (group: 'mode' | 'type', key: string) => {
    const words: Record<string, (typeof MODE_WORDS)[keyof typeof MODE_WORDS] | (typeof TYPE_WORDS)[keyof typeof TYPE_WORDS]> = group === 'mode' ? MODE_WORDS : TYPE_WORDS;
    return words[key] ? t(words[key]) : key;
  };
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="rr-money-h">
        <div className="rr-lead">
          <h2 className="cr-label" id="rr-money-h">{t('sales.moneyIn')}</h2>
          <p className="cr-hero">{money(data.moneyIn.value)}</p>
          <Delta c={data.moneyIn} t={t} />
        </div>
        <div className="rr-smalls">
          {data.discountsMinor > 0 ? <Small label={t('sales.discounts')} value={money(data.discountsMinor)} /> : null}
          {/* Owner rule: three small figures at most — with spend per head and both the others, Refunds makes way. */}
          {data.refundsMinor > 0 && !(data.perHead && data.discountsMinor > 0 && data.deliveryCutMinor > 0) ? <Small label={t('sales.refunds')} value={money(data.refundsMinor)} /> : null}
          {data.deliveryCutMinor > 0 ? <Small label={t('sales.appCut')} value={money(data.deliveryCutMinor)} /> : null}
          {data.perHead ? (
            <Small
              label={t('sales.perHead')}
              value={money(data.perHead.perHeadMinor)}
              sub={t('sales.perHeadSub', { guests: data.perHead.guests, tables: data.perHead.tables })}
            />
          ) : null}
        </div>
        {points.length > 0 ? (
          <>
            <h3 className="rr-list-title">{t('sales.busy')}</h3>
            {/* Owner, 2026-11-25 — with two dates picked above, a chart of hours read as a mistake: say what it adds up. */}
            <p className="rr-more rr-list-sub">{t('sales.busySub')}</p>
            <Bars points={points} money={money} label={t('sales.busy')} />
          </>
        ) : null}
      </section>
      <div className="rr-lists">
        <List
          title={t('sales.byPayment')}
          rows={data.byPayment.filter((p) => p.minor !== 0).slice(0, 5).map((p) => ({ key: p.mode, name: named('mode', p.mode), value: money(p.minor) }))}
        />
        {/* Owner, 2026-11-24 — "How it was eaten" moved to the Overview as "Where sales came from": each fact once. */}
      </div>
      <Freshness f={data.freshness} t={t} locale={locale} />
    </>
  );
}

/* ───────────────────────────── Items ───────────────────────────── */

export function ItemsTab({ data, onOpenCancelled, cancelled }: { data: RestaurantItemsPage; onOpenCancelled?: () => void; cancelled?: RestaurantCancelledPage | 'loading' | 'failed' | null }) {
  const t = useTranslations('restaurantReports');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.dishesSold.value === 0 && data.cancelled.qty === 0) return <p className="rr-empty">{t('empty')}</p>;
  const n = (v: number) => v.toLocaleString(intlLocale(locale));
  const hasProfit = data.top.some((d) => d.profitMinor !== undefined);
  const more = data.sellingCount - data.top.length;
  const when = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="rr-dishes-h">
        <div className="rr-lead">
          <h2 className="cr-label" id="rr-dishes-h">{t('items.dishesSold')}</h2>
          <p className="cr-hero">{n(data.dishesSold.value)}</p>
          <Delta c={data.dishesSold} t={t} />
        </div>
        {data.cancelled.qty > 0 ? (
          <details className="rr-cancelled" onToggle={(e) => (e.currentTarget.open ? onOpenCancelled?.() : undefined)}>
            <summary>
              <Small
                label={t('items.cancelled')}
                value={t('items.cancelledValue', { n: data.cancelled.qty, amount: money(data.cancelled.minor) })}
                sub={
                  data.cancelled.thrownQty === 0
                    ? null
                    : data.cancelled.thrownMinor !== undefined && data.cancelled.thrownMinor > 0
                      ? t('items.thrownCost', { n: data.cancelled.thrownQty, amount: money(data.cancelled.thrownMinor) })
                      : t('items.thrown', { n: data.cancelled.thrownQty })
                }
              />
              <span className="rr-see">{t('seeAll')}</span>
            </summary>
            {cancelled === 'loading' || cancelled === undefined || cancelled === null ? (
              <p className="rr-more" aria-busy="true">{t('loading')}</p>
            ) : cancelled === 'failed' ? (
              <p className="rr-more" role="alert">{t('error')}</p>
            ) : (
              <ul className="rr-cancel-rows">
                {cancelled.rows.map((r, i) => (
                  <li key={`${r.at}-${i}`}>
                    <span className="rr-list-name">
                      {r.qty} × {r.name}
                      <span className="rr-list-note">
                        {[r.wholeOrder ? t('items.wholeOrder') : r.reason, r.by, when.format(new Date(r.at)), r.cooked ? t('items.cooked') : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="rr-list-value">{money(r.minor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        ) : null}
        {data.top.length > 0 ? <TopDishes data={data} money={money} hasProfit={hasProfit} more={more} /> : null}
      </section>
      <div className="rr-lists rr-items-lists">
        {data.perPlate && data.perPlate.length > 0 ? (
          <List
            title={t('items.perPlate')}
            sub={t('items.perPlateSub')}
            rows={data.perPlate.map((d) => ({ key: d.name, name: d.name, note: t('items.plates', { n: d.qty }), value: money(d.perPlateMinor) }))}
          />
        ) : null}
        {data.movers && data.movers.length > 0 ? (
          <List
            title={t('items.movers')}
            sub={t('items.moversSub')}
            rows={data.movers.map((d) => ({
              key: d.name,
              name: d.name,
              note: t('items.moversNote', { now: d.qty, before: d.previousQty }),
              value: d.diff > 0 ? `↑ ${d.diff}` : `↓ ${-d.diff}`,
              tone: d.diff > 0 ? 'up' : 'down',
            }))}
          />
        ) : null}
        {data.notSelling.count > 0 ? (
          <List
            title={t('items.notSelling')}
            sub={t('items.notSellingSub')}
            rows={(data.notSelling.rows ?? data.notSelling.names.map((name) => ({ name, priceMinor: null as number | null }))).map((r) => ({
              key: r.name,
              name: r.name,
              value: r.priceMinor === null ? '' : money(r.priceMinor),
              tone: 'quiet' as const,
            }))}
            more={data.notSelling.count > data.notSelling.names.length ? t('items.moreNotSelling', { n: data.notSelling.count - data.notSelling.names.length }) : null}
          />
        ) : null}
      </div>
      <Freshness f={data.freshness} t={t} locale={locale} />
    </>
  );
}

/**
 * Owner, 2026-11-24 — the Items tab's chart: the top five dishes as bars, by Sales or by plates. A dish's sizes are one
 * row ("Full 41 · Half 41"). The switch is the Reports tabs' own pill buttons, pressed or not.
 */
function TopDishes({ data, money, hasProfit, more }: { data: RestaurantItemsPage; money: Money; hasProfit: boolean; more: number }) {
  const t = useTranslations('restaurantReports.items');
  const [by, setBy] = useState<'sales' | 'plates'>('sales');
  const rows = by === 'plates' && data.topByPlates ? data.topByPlates : data.top;
  const value = (d: RestaurantDish) => (by === 'sales' ? d.salesMinor : d.qty);
  const max = Math.max(1, ...rows.map(value));
  const note = (d: RestaurantDish) =>
    [
      d.sizes && d.sizes.length > 0 ? d.sizes.map((s) => `${s.label} ${s.qty}`).join(' · ') : by === 'sales' ? t('plates', { n: d.qty }) : null,
      // A dish Profit cannot cost says so here, where the owner looks for it (owner, 2026-11-24).
      hasProfit && d.profitMinor === null ? t('noCost') : null,
    ]
      .filter(Boolean)
      .join(' · ');
  return (
    <div className="rr-topdishes">
      <div className="rr-topdishes-head">
        <h3 className="rr-list-title">{t('top')}</h3>
        {data.topByPlates ? (
          <div className="rr-rank-by" role="group" aria-label={t('rankBy')}>
            {(['sales', 'plates'] as const).map((k) => (
              <button key={k} type="button" className={`srp-nav-tab ${by === k ? 'is-active' : ''}`} aria-pressed={by === k} onClick={() => setBy(k)}>
                {t(k === 'sales' ? 'bySales' : 'byPlates')}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <ul className="cr-rows rr-hbars">
        {rows.map((d) => (
          <li key={`${d.productId ?? ''}|${d.name}`} className="cr-row">
            <span className="cr-row-line">
              <span className="cr-row-name">
                <span className="rr-hbar-name">{d.name}</span>
                {note(d) ? <span className="rr-list-note">{note(d)}</span> : null}
              </span>
              <span className="cr-row-money">{by === 'sales' ? money(d.salesMinor) : t('plates', { n: d.qty })}</span>
            </span>
            <span className="cr-row-track" aria-hidden="true">
              <span className="cr-row-fill" style={{ width: `${Math.max(2, (value(d) / max) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="rr-more">{t('moreSold', { n: more })}</p> : null}
    </div>
  );
}

/* ───────────────────────────── Inventory ───────────────────────────── */

export function InventoryTab({ data }: { data: FoodCostReportPage | 'too_long' | 'failed' }) {
  const t = useTranslations('restaurantReports');
  if (data === 'too_long') return <p className="rr-empty">{t('inventory.tooLong')}</p>;
  if (data === 'failed') return <p className="rr-empty" role="alert">{t('error')}</p>;
  const pct = data.totals.foodCostPct;
  return (
    <section className="cr-card rr-card" aria-labelledby="rr-food-h">
      <h2 className="cr-label" id="rr-food-h">{t('inventory.foodCost')}</h2>
      {!data.tracking ? (
        <p className="rr-line">{t('inventory.off')}</p>
      ) : pct === null ? (
        <p className="rr-line">{t('inventory.notEnough')}</p>
      ) : (
        <p className="cr-hero">{t('inventory.ofEvery', { amount: `₹${Math.round(pct)}` })}</p>
      )}
      <AppLink href="/inventory/reports" className="btn rr-open">
        {t('inventory.open')}
      </AppLink>
    </section>
  );
}

/* ───────────────────────────── Customers ───────────────────────────── */

/**
 * Jira GRW-761 — guests who came back (the big number), new guests and bills with a number, and the five who came most.
 * Only guests with a phone number are counted as people. Under 30% of bills with a number, the line asking for numbers
 * takes the figures' place. Names only for someone allowed to see guests; anyone else sees "Guest".
 *
 * Owner, 2026-11-28 — a retail shop's Reports › Customers is this tab in the shop's words (`words="shop"`: customers and
 * products, and the shop's own messages). Absent, it is the restaurant's, word for word.
 */
export function CustomersTab({ data, words = 'restaurant' }: { data: RestaurantCustomersPage; words?: CustomerWords }) {
  const t = useTranslations('restaurantReports');
  const w = useCustomersWords(words);
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  // Review, 2026-11-28 — the overdue, points-waiting and fans lists are counted back from today, not from the picked
  // dates: an empty range (or too few numbers in it) says so, and the lists still follow. Top guests is the range's, so
  // it stays with the figures.
  const lists = (top: boolean) => (
    <div className="rr-lists">
      {data.overdue && data.overdue.count > 0 ? <Overdue overdue={data.overdue} words={words} /> : null}
      {data.pointsWaiting && data.pointsWaiting.count > 0 ? <PointsWaiting waiting={data.pointsWaiting} words={words} /> : null}
      {data.dishFans && data.dishFans.count > 0 ? <DishFans fans={data.dishFans} words={words} /> : null}
      {top ? <TopGuests top={data.top} money={money} words={words} /> : null}
    </div>
  );
  const anyList = (data.overdue?.count ?? 0) > 0 || (data.pointsWaiting?.count ?? 0) > 0 || (data.dishFans?.count ?? 0) > 0;
  // In the order they always were: no bills, then too few numbers, then no one with a number.
  const instead =
    data.bills === 0 ? (
      <p className="rr-empty">{t('empty')}</p>
    ) : data.lowCapture ? (
      <section className="cr-card rr-card" aria-labelledby="rr-guests-h">
        <h2 className="cr-label" id="rr-guests-h">{w('cameBack')}</h2>
        <p className="rr-line">{w('lowCapture')}</p>
        <p className="rr-more">{w('lowCaptureFrom', { pct: data.capturePct })}</p>
      </section>
    ) : data.guestCount === 0 ? (
      <p className="rr-empty">{w('empty')}</p>
    ) : null;
  if (instead) {
    return (
      <>
        {instead}
        {anyList ? lists(false) : null}
      </>
    );
  }
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="rr-guests-h">
        <div className="rr-lead">
          <h2 className="cr-label" id="rr-guests-h">{w('cameBack')}</h2>
          <p className="cr-hero">{data.cameBack.value.toLocaleString(intlLocale(locale))}</p>
          <Delta c={data.cameBack} t={t} />
        </div>
        <div className="rr-smalls">
          <Small label={w('newGuests')} value={data.newGuests.value.toLocaleString(intlLocale(locale))} />
          <Small label={w('withNumber')} value={w('withNumberValue', { pct: data.capturePct })} />
          {data.topShare ? <Small label={w('topShare')} value={w('topShareValue', { pct: data.topShare.pct })} /> : null}
        </div>
        {data.returnByMonth && data.returnByMonth.some((m) => m.newGuests > 0) ? <MonthReturns months={data.returnByMonth} words={words} /> : null}
      </section>
      {lists(true)}
    </>
  );
}

/**
 * Owner, 2026-11-24 — the Guests tab's chart: of the new guests each month (by their first visit), the share who came back
 * within 30 days. A month under 10 new guests says so instead of a bar; a month whose guests still have days left is
 * drawn pale and marked, because its share can still rise.
 */
function MonthReturns({ months: all, words }: { months: NonNullable<RestaurantCustomersPage['returnByMonth']>; words: CustomerWords }) {
  const t = useCustomersWords(words);
  const locale = useLocale();
  const monthName = new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', timeZone: 'UTC' });
  const name = (ym: string) => monthName.format(new Date(`${ym}-01T00:00:00Z`));
  // Owner, 2026-11-24 — "build all six" #1: the months before the restaurant had any new guest are left out, so the
  // bars it has get the room.
  const start = all.findIndex((m) => m.newGuests > 0);
  const months = start < 0 ? [] : all.slice(start);
  const best = Math.max(0, ...months.map((m) => m.pct ?? 0));
  // #2: the one number that matters, big, over the months that have settled (else all that can be said).
  const said = months.filter((m) => m.pct !== null);
  const settled = said.filter((m) => !m.partial);
  const over = settled.length > 0 ? settled : said;
  const n = over.reduce((s, m) => s + m.newGuests, 0);
  const inTen = n > 0 ? Math.round((over.reduce((s, m) => s + m.cameBack, 0) / n) * 10) : null;
  return (
    <div className="rr-chart rr-returns">
      <h3 className="rr-list-title">{t('returnTitle')}</h3>
      <p className="rr-more rr-returns-sub">{t('returnSub')}</p>
      <div className="rr-returns-body">
        {inTen !== null ? (
          <div className="rr-returns-stat">
            <p className="rr-stat-big">{inTen === 0 ? t('returnStatLowBig') : t('returnStatBig', { n: inTen })}</p>
            <p className="rr-stat-text">{t('returnStatText')}</p>
            <p className="rr-stat-months">
              {said
                .map((m) => t(m.partial ? 'returnStatMonthOpen' : 'returnStatMonth', { month: name(m.month), back: m.cameBack, n: m.newGuests }))
                .join(' · ')}
            </p>
          </div>
        ) : null}
        <ul className="cr-bars cr-bars-day rr-bars" aria-label={t('returnTitle')}>
          {months.map((m) => (
            <li key={m.month} className={`cr-bar-col${m.partial ? ' is-today' : ''}`}>
              <span className={`cr-bar-top${m.pct !== null && m.pct === best ? ' is-peak' : ''}`} aria-hidden="true">
                {m.pct === null ? '–' : `${m.pct}%`}
              </span>
              <span className="cr-bar-slot">
                <span className={`cr-bar${m.pct !== null && m.pct === best ? ' is-peak' : ''}`} style={{ height: `${m.pct === null ? 0 : Math.max(2, m.pct)}%` }} />
              </span>
              <span className="cr-bar-tick" aria-hidden="true">{m.partial ? `${name(m.month)}*` : name(m.month)}</span>
              <span className="sr-only">
                {name(m.month)}: {m.newGuests === 0 ? t('returnNone') : m.pct === null ? t('returnFew', { n: m.newGuests }) : t('returnSr', { pct: m.pct, back: m.cameBack, n: m.newGuests })}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {months.some((m) => m.partial) ? <p className="rr-more">{t('returnPartial')}</p> : null}
      {months.some((m) => m.pct === null && m.newGuests > 0) ? <p className="rr-more">{t('returnFewNote')}</p> : null}
    </div>
  );
}

/**
 * Owner, 2026-11-24 — regulars away twice as long as they usually are, most valuable first. Five, then "See all". The
 * WhatsApp button only opens a chat with their number and a hello: the owner writes and sends it, nothing is sent for them.
 * Someone who may not see guests is sent the count alone, and sees that.
 */
function Overdue({ overdue, words }: { overdue: NonNullable<RestaurantCustomersPage['overdue']>; words: CustomerWords }) {
  const t = useCustomersWords(words);
  // The guest's line, or the shop customer's (`miss-you.ts`).
  const { missYouFor, missYouTemplate } = missYouIn(words);
  const [all, setAll] = useState(false);
  /* Owner, 2026-11-26 — "missing you" messages: a ready line per guest, sent from the owner's own WhatsApp. */
  const [composing, setComposing] = useState(false);
  const session = useSession();
  const branchContext = useBranch();
  const business = session?.businessName ?? null;
  // The branch whose offers the Comeback treat may name. Every branch picked: none — the list holds every branch's
  // guests, and an offer published to one branch would be refused at the others' tills (review, 2026-11-27).
  const offersAt = branchContext.multi ? branchContext.choice : (session?.branches?.[0]?.id ?? null);
  const today = todayInZone(session?.timezone);
  const messaged = useMessaged(today);
  const title = (
    <h3 className="rr-list-title" id="rr-overdue-h">
      {t('overdueTitle')} <span className="rr-list-count">· {overdue.count}</span>
    </h3>
  );
  if (overdue.rows.length === 0) {
    return (
      <section className="rr-list" aria-labelledby="rr-overdue-h">
        {title}
        <p className="rr-line">{t('overdueCount', { n: overdue.count })}</p>
      </section>
    );
  }
  const rows = all ? overdue.rows : overdue.rows.slice(0, LIST_SHOWN);
  return (
    <section className="rr-list rr-people rr-overdue" aria-labelledby="rr-overdue-h">
      {title}
      <p className="rr-more rr-overdue-sub">{t('overdueSub')}</p>
      <button type="button" className="btn rr-miss-you" onClick={() => setComposing(true)}>
        <IconWhatsApp />
        {t('missYou.open')}
      </button>
      {composing ? (
        <MissYouSheet
          guests={overdue.rows}
          business={business}
          location={offersAt}
          todayISO={today}
          onClose={() => setComposing(false)}
          words={words}
        />
      ) : null}
      <ul>
        {rows.map((g) => (
          <li key={g.customerId}>
            {/* #3 — initials in a colour of their own: the app's Avatar, as on Home. */}
            <Avatar name={g.name} id={g.customerId} size={36} />
            <span className="rr-list-name">
              {g.name ?? t('hidden')}
              {/* #4 — their habit, and how late they are, at a glance. */}
              <span className="rr-list-note">
                {t('overdueUsual', { gap: g.usualGapDays })}
                <Messaged ago={messaged.daysAgo(g.phone)} />
              </span>
            </span>
            <span className="rr-away">{t('overdueAway', { n: g.lastSeenDaysAgo })}</span>
            {/* #5 — a round button, not a pill: five green pills were the loudest thing on the screen. */}
            <a
              className="rr-wa"
              // Owner, 2026-11-26 — no name and no "Hi": the guest's own row sends the "misses you" line.
              href={whatsappHref(g.phone.replace(/\D/g, ''), missYouFor(missYouTemplate('miss', business), g.favouriteDish))}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('overdueWaAria', { name: g.name ?? t('hidden') })}
              onClick={() => messaged.mark(g.phone)}
            >
              <IconWhatsApp />
            </a>
          </li>
        ))}
      </ul>
      {!all && overdue.rows.length > LIST_SHOWN ? (
        <button type="button" className="btn btn-ghost rr-see-all" onClick={() => setAll(true)}>
          {t('overdueAll', { n: overdue.count })}
        </button>
      ) : null}
      {all && overdue.count > overdue.rows.length ? <p className="rr-more">{t('overdueMore', { n: overdue.count - overdue.rows.length })}</p> : null}
    </section>
  );
}

/**
 * Owner, 2026-11-27 — "Points waiting to be used": guests who could spend their points today (at least the business's
 * minimum to redeem), points about to die first. A reminder per guest, or the sheet to send them all one by one.
 * Anyone not allowed to see guests gets the count only, like the overdue list.
 */
function PointsWaiting({ waiting, words }: { waiting: RestaurantPointsWaiting; words: CustomerWords }) {
  const t = usePointsWords(words);
  const [all, setAll] = useState(false);
  const [composing, setComposing] = useState(false);
  const session = useSession();
  const business = session?.businessName ?? null;
  const messaged = useMessaged(todayInZone(session?.timezone));
  const cap = waiting.redeemCapPct ?? 100;
  const title = (
    <h3 className="rr-list-title" id="rr-points-h">
      {t('title')} <span className="rr-list-count">· {waiting.count}</span>
    </h3>
  );
  if (waiting.rows.length === 0) {
    return (
      <section className="rr-list" aria-labelledby="rr-points-h">
        {title}
        <p className="rr-line">{t('count', { n: waiting.count })}</p>
      </section>
    );
  }
  const rows = all ? waiting.rows : waiting.rows.slice(0, LIST_SHOWN);
  return (
    <section className="rr-list rr-people rr-overdue rr-points" aria-labelledby="rr-points-h">
      {title}
      <p className="rr-more rr-overdue-sub">{t('sub')}</p>
      <button type="button" className="btn rr-miss-you" onClick={() => setComposing(true)}>
        <IconWhatsApp />
        {t('open')}
      </button>
      {composing ? <PointsSheet guests={waiting.rows} business={business} capPct={cap} onClose={() => setComposing(false)} words={words} /> : null}
      <ul>
        {rows.map((g) => (
          <li key={g.customerId}>
            <Avatar name={g.name} id={g.customerId} size={36} />
            <span className="rr-list-name">
              {g.name ?? t('guest')}
              <span className="rr-list-note">
                {t('worth', { points: pointsNumber(g.points), worth: pointsRupees(g.worthMinor) })}
                <Messaged ago={messaged.daysAgo(g.phone)} />
              </span>
            </span>
            {g.expiring ? <span className="rr-away">{t('expires', { n: pointsNumber(g.expiring.points), date: shortDay(g.expiring.on) })}</span> : null}
            <a
              className="rr-wa"
              href={whatsappHref(g.phone.replace(/\D/g, ''), pointsFor(pointsTemplate(business, words), g, cap))}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('waAria', { name: g.name ?? t('guest') })}
              onClick={() => messaged.mark(g.phone)}
            >
              <IconWhatsApp />
            </a>
          </li>
        ))}
      </ul>
      {!all && waiting.rows.length > LIST_SHOWN ? (
        <button type="button" className="btn btn-ghost rr-see-all" onClick={() => setAll(true)}>
          {t('all', { n: waiting.count })}
        </button>
      ) : null}
      {all && waiting.count > waiting.rows.length ? <p className="rr-more">{t('more', { n: waiting.count - waiting.rows.length })}</p> : null}
    </section>
  );
}

/**
 * Owner, 2026-11-27 — "fans of a dish who have not come back in 15 days": pick a dish, see who keeps ordering it and has
 * not been in, and send them one message naming it — row by row, or from the sheet. Anyone not allowed to see guests
 * gets each dish's count only.
 */
function DishFans({ fans, words }: { fans: RestaurantDishFans; words: CustomerWords }) {
  const t = useFansWords(words);
  const [chosen, setChosen] = useState(fans.dishes[0]?.key ?? '');
  const [all, setAll] = useState(false);
  const [composing, setComposing] = useState(false);
  const session = useSession();
  const business = session?.businessName ?? null;
  const messaged = useMessaged(todayInZone(session?.timezone));
  const dish = fans.dishes.find((d) => d.key === chosen) ?? fans.dishes[0];
  if (!dish) return null;
  const name = fanDish(dish.dish);
  const title = (
    <h3 className="rr-list-title" id="rr-fans-h">
      {t('title')} <span className="rr-list-count">· {fans.count}</span>
    </h3>
  );
  const sub = <p className="rr-more rr-overdue-sub">{t('sub', { orders: fans.minOrders, days: fans.awayDays })}</p>;
  const chips = (
    <div className="my-chips rr-fan-dishes" role="radiogroup" aria-label={t('pick')}>
      {fans.dishes.map((d) => (
        <button
          key={d.key}
          type="button"
          role="radio"
          aria-checked={d.key === dish.key}
          className={`my-chip${d.key === dish.key ? ' is-on' : ''}`}
          onClick={() => {
            setChosen(d.key);
            setAll(false);
          }}
        >
          {t('chip', { dish: fanDish(d.dish), n: d.fans })}
        </button>
      ))}
    </div>
  );
  if (dish.rows.length === 0) {
    return (
      <section className="rr-list rr-fans" aria-labelledby="rr-fans-h">
        {title}
        {sub}
        {chips}
      </section>
    );
  }
  const rows = all ? dish.rows : dish.rows.slice(0, LIST_SHOWN);
  const message = dishFansTemplate(dish.dish, business, words);
  return (
    <section className="rr-list rr-people rr-overdue rr-fans" aria-labelledby="rr-fans-h">
      {title}
      {sub}
      {chips}
      <button type="button" className="btn rr-miss-you" onClick={() => setComposing(true)}>
        <IconWhatsApp />
        {t('open', { dish: name })}
      </button>
      {composing ? (
        <GuestMessageSheet
          labels={sheetLabels(t)}
          title={t('sheetTitle', { dish: name })}
          initialText={message}
          hint={t('hint')}
          guests={dish.rows}
          meta={(g) => `${t('orders', { n: g.orders })} · ${t('away', { n: g.lastSeenDaysAgo })}`}
          messageFor={(text) => text}
          onClose={() => setComposing(false)}
        />
      ) : null}
      <ul>
        {rows.map((g) => (
          <li key={g.customerId}>
            <Avatar name={g.name} id={g.customerId} size={36} />
            <span className="rr-list-name">
              {g.name ?? t('guest')}
              <span className="rr-list-note">
                {t('orders', { n: g.orders })}
                <Messaged ago={messaged.daysAgo(g.phone)} />
              </span>
            </span>
            <span className="rr-away">{t('away', { n: g.lastSeenDaysAgo })}</span>
            <a
              className="rr-wa"
              href={whatsappHref(g.phone.replace(/\D/g, ''), message)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('waAria', { name: g.name ?? t('guest'), dish: name })}
              onClick={() => messaged.mark(g.phone)}
            >
              <IconWhatsApp />
            </a>
          </li>
        ))}
      </ul>
      {!all && dish.rows.length > LIST_SHOWN ? (
        <button type="button" className="btn btn-ghost rr-see-all" onClick={() => setAll(true)}>
          {t('all', { n: dish.fans })}
        </button>
      ) : null}
      {all && dish.fans > dish.rows.length ? <p className="rr-more">{t('more', { n: dish.fans - dish.rows.length })}</p> : null}
    </section>
  );
}

/** "· Messaged 3 days ago" after a guest's line, when any Guests list sent them something lately (`messaged.ts`). */
function Messaged({ ago }: { ago: number | null }) {
  const t = useTranslations('restaurantReports.customers');
  return ago === null ? null : <>{` · ${t('messaged', { n: ago })}`}</>;
}

/** #6 — Top guests: a rank, their initials, their visits, what they spent; "Most visits in these dates" says the order. */
function TopGuests({ top, money, words }: { top: RestaurantCustomersPage['top']; money: Money; words: CustomerWords }) {
  const t = useCustomersWords(words);
  if (top.length === 0) return null;
  return (
    <section className="rr-list rr-people rr-top-guests" aria-labelledby="rr-top-h">
      <h3 className="rr-list-title" id="rr-top-h">{t('top')}</h3>
      <p className="rr-more rr-overdue-sub">{t('topSub')}</p>
      <ol>
        {top.map((g, i) => (
          <li key={g.customerId ?? String(i)}>
            <span className="rr-rank" aria-hidden="true">{i + 1}</span>
            <Avatar name={g.name} id={g.customerId ?? `hidden-${i}`} size={36} nobody={g.name === null} />
            <span className="rr-list-name">
              {g.name ?? t('hidden')}
              <span className="rr-list-note">{t('visits', { n: g.visits })}</span>
            </span>
            {g.salesMinor === null ? null : <span className="rr-list-value">{money(g.salesMinor)}</span>}
          </li>
        ))}
      </ol>
      <p className="rr-more">{t('perBranch')}</p>
    </section>
  );
}

/* ───────────────────────────── Tips ───────────────────────────── */

/** Where a tip's "Open" goes: the tab whose figures it is about. */
const TIP_TAB: Record<TipCard['rule'], RestaurantTab> = {
  sales_change: 'overview',
  busy_shift: 'sales',
  dish_move: 'items',
  cancelled: 'items',
  dish_cost_up: 'inventory',
  food_wasted: 'inventory',
  count_short: 'inventory',
  guests_back: 'customers',
  dish_brings_back: 'items',
};
const UNITS = ['kg', 'l', 'pcs'] as const;
const REASONS = ['spoiled', 'dropped', 'expired', 'other'] as const;

/**
 * Jira GRW-759 — at most three tips, each four short lines: what we saw, the numbers (both weeks), one thing to try, how
 * sure we are. A "why" line only when the numbers alone do not say it. Nothing at all to say: one line.
 */
export function TipsTab({ data, onOpen }: { data: RestaurantTipsPage; onOpen?: (tab: RestaurantTab) => void }) {
  const t = useTranslations('restaurantReports.tips');
  const tabs = useTranslations('restaurantReports.tabs');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  const pct = (v: number) => Math.round(Math.abs(v));
  const recipes = data.recipesShort ? <p className="rr-more">{t('recipesShort')}</p> : null;
  if (data.tips.length === 0) {
    return (
      <>
        <p className="rr-empty">{data.bills < data.minBills ? t('notEnough', { n: data.minBills }) : t('normal')}</p>
        {recipes}
      </>
    );
  }
  const unitOf = (u: string) => ((UNITS as readonly string[]).includes(u) ? t(`unit.${u as (typeof UNITS)[number]}`) : u);
  const reasonOf = (r: string) => ((REASONS as readonly string[]).includes(r) ? t(`reason.${r as (typeof REASONS)[number]}`) : r);
  const qtyOf = (thousandths: number) => (Math.abs(thousandths) / 1000).toLocaleString(intlLocale(locale), { maximumFractionDigits: 2 });
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const asDay = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
  const w = data.tips[0]!.windows;
  const card = (tip: TipCard) => {
    const p = tip.payload;
    if (p.rule === 'sales_change') {
      const sameSpend = p.previousAverageBill > 0 && Math.abs(p.averageBill - p.previousAverageBill) / p.previousAverageBill <= 0.05;
      return {
        saw: t(p.pct >= 0 ? 'salesUp' : 'salesDown', { pct: pct(p.pct) }),
        numbers: t('salesNumbers', { now: money(p.sales), before: money(p.previousSales), bills: p.bills, prevBills: p.previousBills }),
        why: sameSpend && p.bills !== p.previousBills ? t(p.bills < p.previousBills ? 'fewerPeople' : 'morePeople') : null,
        tryThis: t(p.pct >= 0 ? 'salesTryUp' : 'salesTryDown'),
      };
    }
    if (p.rule === 'busy_shift') {
      return {
        saw: t(p.pct >= 0 ? 'busyUp' : 'busyDown', { block: t(`block.${p.block}`), pct: pct(p.pct) }),
        numbers: t('busyNumbers', { now: money(p.sales), before: money(p.previousSales) }),
        why: null,
        tryThis: t('busyTry'),
      };
    }
    if (p.rule === 'dish_move') {
      return {
        saw: t(p.pct >= 0 ? 'dishUp' : 'dishDown', { name: p.name }),
        numbers: t('dishNumbers', { qty: p.qty, prevQty: p.previousQty, now: money(p.sales), before: money(p.previousSales) }),
        why: null,
        tryThis: t('dishTry', { name: p.name }),
      };
    }
    if (p.rule === 'dish_cost_up') {
      return {
        saw: t('dishCostTitle', { name: p.name, now: money(p.perPlate), before: money(p.previousPerPlate) }),
        numbers: [
          p.ingredient ? t('dishCostIngredient', { ingredient: p.ingredient.name, before: money(p.ingredient.previousPrice), now: money(p.ingredient.price), unit: unitOf(p.ingredient.unit) }) : null,
          t('dishCostEstimate', { amount: money(p.extraMonthly) }),
        ].filter(Boolean).join(' '),
        why: null,
        tryThis: t('dishCostTry'),
      };
    }
    if (p.rule === 'food_wasted') {
      return {
        saw: t('wastedTitle', { amount: money(p.wastedMinor) }),
        numbers: [t('wastedNumbers', { pct: Math.round(p.pct) }), p.material ? t('wastedMost', { material: p.material, reason: p.reason ? reasonOf(p.reason) : '—' }) : null].filter(Boolean).join(' '),
        why: null,
        tryThis: t('wastedTry'),
      };
    }
    if (p.rule === 'guests_back') {
      return {
        saw: t(p.pct >= 0 ? 'guestsUp' : 'guestsDown', { n: p.cameBack, before: p.previousCameBack }),
        numbers: t('guestsNumbers', { guests: p.guests, prevGuests: p.previousGuests }),
        why: null,
        tryThis: t('guestsTry'),
      };
    }
    if (p.rule === 'count_short') {
      return {
        saw: t('countTitle', { name: p.name, qty: qtyOf(p.diffQty), unit: unitOf(p.unit) }),
        numbers: t('countNumbers', { pct: Math.round(p.pct), expected: qtyOf(p.expectedQty), unit: unitOf(p.unit), amount: money(Math.abs(p.diffMinor)) }),
        why: null,
        tryThis: t('countTry'),
      };
    }
    if (p.rule === 'dish_brings_back') {
      return {
        saw: t('backTitle', { name: p.name }),
        numbers: t('backNumbers', { pct: p.pct, all: p.allPct }),
        why: t('backWhy', { n: p.firstTimers, from: asDay(p.from), to: asDay(p.to) }),
        tryThis: t('backTry'),
      };
    }
    return {
      saw: t('cancelledTitle', { n: p.qty }),
      numbers: [t('cancelledNumbers', { amount: money(p.minor), pct: Math.round(p.pctOfSales) }), p.topReason ? t('cancelledReason', { reason: p.topReason, n: p.topReasonQty }) : null].filter(Boolean).join(' '),
      why: null,
      tryThis: t('cancelledTry'),
    };
  };
  const when = data.builtAt ? new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(data.builtAt)) : '';
  return (
    <>
      <p className="rr-more rr-tip-window">{t('window', { from: asDay(w.from), to: asDay(w.to) })}</p>
      {data.stale ? <p className="rr-more">{t('stale', { when })}</p> : null}
      <ol className="rr-tips">
        {data.tips.map((tip) => {
          const c = card(tip);
          return (
            <li key={tip.rule} className="cr-card rr-tip">
              <p className="rr-tip-saw">{c.saw}</p>
              <p className="rr-tip-numbers">{c.numbers}</p>
              {c.why ? <p className="rr-tip-why">{c.why}</p> : null}
              <p className="rr-tip-try">{c.tryThis}</p>
              <div className="rr-tip-foot">
                <span className="rr-tip-sure">{tip.rule === 'dish_brings_back' ? t(`sureGuests.${tip.sure}`, { n: tip.bills }) : t(`sure.${tip.sure}`, { n: tip.bills })}</span>
                {onOpen ? (
                  <button type="button" className="btn btn-ghost rr-tip-open" onClick={() => onOpen(TIP_TAB[tip.rule])}>
                    {t('open')} · {tabs(TIP_TAB[tip.rule])}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {recipes}
    </>
  );
}

/* ───────────────────────────── The screen ───────────────────────────── */

export function RestaurantReports({ initialTab = 'overview' }: { initialTab?: RestaurantTab }) {
  const t = useTranslations('restaurantReports');
  const session = useSession();
  const mayOpen = useMayOpen();
  const todayISO = todayInZone(session?.timezone);
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;
  const tabs = RESTAURANT_TABS.filter((k) => k !== 'inventory' || mayOpen('/inventory/reports'));
  const [tab, setTab] = useState<RestaurantTab>(tabs.includes(initialTab) ? initialTab : 'overview');
  const [dates, setDates] = useState(() => defaultReportRange(todayISO));
  /*
   * The data is kept WITH the tab, dates and branch it was read for. Found by the restaurant browser suite: on a tab switch
   * React draws once with the new tab before the effect clears the old data, and the Sales tab drew the Overview's payload
   * (no `moneyIn`) and crashed. Data for another key is never drawn — the placeholder is, until this key's arrives.
   */
  const key = `${tab}|${dates.fromISO}|${dates.toISO}|${branch}`;
  const [loaded, setLoaded] = useState<{ key: string; value: unknown } | null>(null);
  const data = loaded?.key === key ? loaded.value : null;
  const [failed, setFailed] = useState(false);
  const [cancelled, setCancelled] = useState<RestaurantCancelledPage | 'loading' | 'failed' | null>(null);
  const seq = useRef(0);

  /*
   * Owner, 2026-11-24 — what a tab read is kept in memory (report-cache.ts), under who is signed in as well as the tab,
   * dates and branch. Going back to a tab draws it at once with no request; past its freshness it is drawn at once AND
   * read again quietly. "Try again" always reads afresh. Only the tab on screen is ever read.
   */
  // QA #7 — the branches this person may see are part of who they are here: two businesses never share a cache entry even
  // when one phone has the same name and role in both.
  const who = `${session?.phone ?? ''}|${session?.businessName ?? ''}|${session?.role ?? ''}|${branches.map((b) => b.id).sort().join(',')}`;
  const load = useCallback(
    async (force = false) => {
      if (!ready) return;
      const mine = ++seq.current;
      const forKey = key;
      const cacheKey = `${who}|${forKey}`;
      setFailed(false);
      setCancelled(null);
      const hit = force ? undefined : peek<unknown>(cacheKey);
      if (hit) {
        setLoaded({ key: forKey, value: hit.value });
        if (isFresh(hit, freshFor(dates.toISO, todayISO))) return;
      }
      const q = { from: dates.fromISO, to: dates.toISO, location: branch || undefined };
      const read = async (): Promise<unknown> => {
        if (tab === 'tips') return api.restaurantReport<RestaurantTipsPage>('tips', q);
        if (tab === 'customers') return api.restaurantReport<RestaurantCustomersPage>('customers', q);
        if (tab === 'inventory') {
          const days = Math.round((Date.parse(dates.toISO) - Date.parse(dates.fromISO)) / 86_400_000) + 1;
          return days > 92 ? 'too_long' : api.foodCostReport(q);
        }
        return api.restaurantReport(tab, q);
      };
      try {
        const res = await fetchOnce(cacheKey, read);
        if (mine === seq.current) setLoaded({ key: forKey, value: res });
      } catch {
        // A failed quiet refresh keeps the figures already on screen; only a first read shows the error.
        if (mine !== seq.current || hit) return;
        if (tab === 'inventory') setLoaded({ key: forKey, value: 'failed' });
        else setFailed(true);
      }
    },
    [ready, dates.fromISO, dates.toISO, branch, tab, key, who, todayISO],
  );
  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Owner, 2026-11-24 — the Overview's "Worth a look" says how many tips there are this week. Read with the Tips tab's
   * own cache key, so opening Tips afterwards draws at once; a failed read simply leaves the line out.
   */
  const [tipCount, setTipCount] = useState<number | null>(null);
  useEffect(() => {
    if (!ready || tab !== 'overview' || !tabs.includes('tips')) return;
    let gone = false;
    const tipsKey = `${who}|tips|${dates.fromISO}|${dates.toISO}|${branch}`;
    const hit = peek<RestaurantTipsPage>(tipsKey);
    if (hit) setTipCount(hit.value.tips.length);
    if (hit && isFresh(hit, freshFor(dates.toISO, todayISO))) return;
    fetchOnce(tipsKey, () => api.restaurantReport<RestaurantTipsPage>('tips', { from: dates.fromISO, to: dates.toISO, location: branch || undefined }))
      .then((r) => {
        if (!gone) setTipCount(r.tips.length);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
    // `tabs` is derived each render; whether it holds Tips is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tab, who, dates.fromISO, dates.toISO, branch, todayISO, tabs.includes('tips')]);

  // The tab is in the address, so a reload or a shared link opens the same one.
  const choose = (k: RestaurantTab) => {
    setTab(k);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', k);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* the tab still changes */
    }
  };

  const openCancelled = async () => {
    if (cancelled !== null && cancelled !== 'failed') return;
    const cacheKey = `${who}|cancelled|${dates.fromISO}|${dates.toISO}|${branch}`;
    const hit = peek<RestaurantCancelledPage>(cacheKey);
    if (hit && isFresh(hit, freshFor(dates.toISO, todayISO))) return setCancelled(hit.value);
    setCancelled('loading');
    try {
      setCancelled(
        await fetchOnce(cacheKey, () =>
          api.restaurantReport<RestaurantCancelledPage>('cancelled', { from: dates.fromISO, to: dates.toISO, location: branch || undefined }),
        ),
      );
    } catch {
      setCancelled('failed');
    }
  };

  const changeDates = (fromISO: string, toISO: string, changed: ChangedEnd) => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(fromISO) || !iso.test(toISO)) return;
    setDates(clampReportRange(fromISO, toISO, todayISO, changed));
  };

  return (
    <div className="cr rr">
      <nav className="srp-nav srp-nav-links rr-tabs" aria-label={t('tabsLabel')}>
        {tabs.map((k) => (
          <button key={k} type="button" className={`srp-nav-tab ${k === tab ? 'is-active' : ''}`} aria-current={k === tab ? 'page' : undefined} onClick={() => choose(k)}>
            {t(`tabs.${k}`)}
          </button>
        ))}
      </nav>
      {/* Tips are always the last 7 finished days against the 7 before: no dates to pick. */}
      <div className="cr-toolbar" hidden={tab === 'tips'}>
        <ReportDates from={dates.fromISO} to={dates.toISO} today={todayISO} labels={{ group: t('rangeLabel'), from: t('from'), to: t('to') }} onChange={changeDates} />
      </div>
      {failed ? (
        <div className="ord-state" role="alert">
          <p>{t('error')}</p>
          <button type="button" className="btn" onClick={() => void load(true)}>
            {t('retry')}
          </button>
        </div>
      ) : data === null ? (
        <div className="cr-card cr-skeleton" aria-busy="true" />
      ) : tab === 'overview' ? (
        <OverviewTab data={data as RestaurantOverviewPage} todayISO={todayISO} tipCount={tipCount} onOpen={choose} />
      ) : tab === 'sales' ? (
        <SalesTab data={data as RestaurantSalesPage} />
      ) : tab === 'items' ? (
        <ItemsTab data={data as RestaurantItemsPage} cancelled={cancelled} onOpenCancelled={() => void openCancelled()} />
      ) : tab === 'customers' ? (
        <CustomersTab data={data as RestaurantCustomersPage} />
      ) : tab === 'tips' ? (
        <TipsTab data={data as RestaurantTipsPage} onOpen={choose} />
      ) : (
        <InventoryTab data={data as FoodCostReportPage | 'too_long' | 'failed'} />
      )}
    </div>
  );
}
