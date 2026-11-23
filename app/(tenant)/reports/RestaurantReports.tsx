'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import AppLink from '../../shared/AppLink';
import { api } from '../lib/api';
import type {
  FoodCostReportPage,
  RestaurantCancelledPage,
  RestaurantCompared,
  RestaurantCustomersPage,
  RestaurantFreshness,
  RestaurantItemsPage,
  RestaurantOverviewPage,
  RestaurantSalesPage,
  RestaurantTipsPage,
  TipCard,
} from '../lib/api-types';
import { formatMoney, intlLocale } from '../lib/format';
import { useBranch } from '../components/BranchProvider';
import { useMayOpen, useSession } from '../components/SessionProvider';
import { ReportDates } from './ReportDates';
import { RESTAURANT_TABS, type RestaurantTab } from './restaurant-tabs';
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

/** A bar for each point, its amount on top. More than 8 points: only the best one carries its amount. */
function Bars({ points, money, label }: { points: Array<{ key: string; tick: string; full: string; minor: number }>; money: Money; label: string }) {
  const peak = Math.max(0, ...points.map((p) => p.minor));
  const every = points.length <= 8;
  const best = points.findIndex((p) => p.minor === peak && peak > 0);
  const short = (minor: number) => (minor >= 1_000_000 ? `₹${Math.round(minor / 100_000)}k` : money(minor));
  return (
    <ul className="cr-bars cr-bars-day rr-bars" aria-label={label}>
      {points.map((p, i) => (
        <li key={p.key} className="cr-bar-col">
          <span className={`cr-bar-top${i === best ? ' is-peak' : ''}`} aria-hidden="true">
            {p.minor > 0 && (every || i === best) ? short(p.minor) : ''}
          </span>
          <span className="cr-bar-slot">
            <span className={`cr-bar${i === best ? ' is-peak' : ''}`} style={{ height: `${peak === 0 || p.minor <= 0 ? 0 : Math.max(4, (p.minor / peak) * 100)}%` }} />
          </span>
          <span className="cr-bar-tick" aria-hidden="true">{p.tick}</span>
          <span className="sr-only">
            {p.full} {money(p.minor)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A small figure: its name, its amount. */
function Small({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rr-small">
      <p className="rr-small-label">{label}</p>
      <p className="rr-small-value">{value}</p>
      {sub ? <p className="rr-small-sub">{sub}</p> : null}
    </div>
  );
}

/** A list of up to five rows: a name and an amount. */
function List({ title, rows, more }: { title: string; rows: Array<{ key: string; name: string; value: string; note?: string | null }>; more?: string | null }) {
  if (rows.length === 0) return null;
  return (
    <section className="rr-list" aria-label={title}>
      <h3 className="rr-list-title">{title}</h3>
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            <span className="rr-list-name">
              {r.name}
              {r.note ? <span className="rr-list-note">{r.note}</span> : null}
            </span>
            <span className="rr-list-value">{r.value}</span>
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

/* ───────────────────────────── Overview ───────────────────────────── */

export function OverviewTab({ data }: { data: RestaurantOverviewPage }) {
  const t = useTranslations('restaurantReports');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.sales.value === 0 && data.bills.value === 0) return <p className="rr-empty">{t('empty')}</p>;
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const points = data.byDay.map((d, i) => ({
    key: d.day,
    tick: i === 0 || i === data.byDay.length - 1 || data.byDay.length <= 8 ? day.format(asDate(d.day)) : '',
    full: weekday.format(asDate(d.day)),
    minor: d.salesMinor,
  }));
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="rr-sales-h">
        <h2 className="cr-label" id="rr-sales-h">{t('overview.sales')}</h2>
        <p className="cr-hero">{money(data.sales.value)}</p>
        <Delta c={data.sales} t={t} />
        <div className="rr-smalls">
          <Small label={t('overview.bills')} value={data.bills.value.toLocaleString(intlLocale(locale))} />
          {data.averageBillMinor.value !== null ? <Small label={t('overview.average')} value={money(data.averageBillMinor.value)} /> : null}
          {data.profit ? (
            <Small
              label={t('overview.profit')}
              value={money(data.profit.profitMinor)}
              sub={data.profit.uncostedSalesMinor > 0 ? t('overview.profitPart', { amount: money(data.profit.uncostedSalesMinor) }) : null}
            />
          ) : null}
        </div>
        <Bars points={points} money={money} label={t('overview.byDay')} />
      </section>
      <Freshness f={data.freshness} t={t} locale={locale} />
    </>
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
  const points = [];
  for (let h = first; h <= last; h++) points.push({ key: String(h), tick: h === first || h === last || (h - first) % 3 === 0 ? hourName(h) : '', full: hourName(h), minor: by.get(h) ?? 0 });
  const named = (group: 'mode' | 'type', key: string) => {
    const words: Record<string, (typeof MODE_WORDS)[keyof typeof MODE_WORDS] | (typeof TYPE_WORDS)[keyof typeof TYPE_WORDS]> = group === 'mode' ? MODE_WORDS : TYPE_WORDS;
    return words[key] ? t(words[key]) : key;
  };
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="rr-money-h">
        <h2 className="cr-label" id="rr-money-h">{t('sales.moneyIn')}</h2>
        <p className="cr-hero">{money(data.moneyIn.value)}</p>
        <Delta c={data.moneyIn} t={t} />
        <div className="rr-smalls">
          {data.discountsMinor > 0 ? <Small label={t('sales.discounts')} value={money(data.discountsMinor)} /> : null}
          {data.refundsMinor > 0 ? <Small label={t('sales.refunds')} value={money(data.refundsMinor)} /> : null}
          {data.deliveryCutMinor > 0 ? <Small label={t('sales.appCut')} value={money(data.deliveryCutMinor)} /> : null}
        </div>
        {points.length > 0 ? (
          <>
            <h3 className="rr-list-title">{t('sales.busy')}</h3>
            <Bars points={points} money={money} label={t('sales.busy')} />
          </>
        ) : null}
      </section>
      <div className="rr-lists">
        <List
          title={t('sales.byPayment')}
          rows={data.byPayment.filter((p) => p.minor !== 0).slice(0, 5).map((p) => ({ key: p.mode, name: named('mode', p.mode), value: money(p.minor) }))}
        />
        <List
          title={t('sales.byType')}
          rows={data.byOrderType.filter((o) => o.salesMinor !== 0 || o.bills > 0).slice(0, 5).map((o) => ({
            key: o.type,
            name: named('type', o.type),
            note: t('sales.bills', { n: o.bills }),
            value: money(o.salesMinor),
          }))}
        />
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
        <h2 className="cr-label" id="rr-dishes-h">{t('items.dishesSold')}</h2>
        <p className="cr-hero">{n(data.dishesSold.value)}</p>
        <Delta c={data.dishesSold} t={t} />
        {data.cancelled.qty > 0 ? (
          <details className="rr-cancelled" onToggle={(e) => (e.currentTarget.open ? onOpenCancelled?.() : undefined)}>
            <summary>
              <Small label={t('items.cancelled')} value={t('items.cancelledValue', { n: data.cancelled.qty, amount: money(data.cancelled.minor) })} />
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
                        {[r.reason, r.by, when.format(new Date(r.at)), r.cooked ? t('items.cooked') : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="rr-list-value">{money(r.minor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        ) : null}
      </section>
      <div className="rr-lists">
        <List
          title={t('items.top')}
          rows={data.top.map((d) => ({
            key: d.productId ?? d.name,
            name: d.name,
            note: [t('items.plates', { n: d.qty }), hasProfit && d.profitMinor !== undefined && d.profitMinor !== null ? t('items.profit', { amount: money(d.profitMinor) }) : null].filter(Boolean).join(' · '),
            value: money(d.salesMinor),
          }))}
          more={more > 0 ? t('items.moreSold', { n: more }) : null}
        />
        {data.notSelling.count > 0 ? (
          <List
            title={t('items.notSelling')}
            rows={data.notSelling.names.map((name) => ({ key: name, name, value: '' }))}
            more={data.notSelling.count > data.notSelling.names.length ? t('items.moreNotSelling', { n: data.notSelling.count - data.notSelling.names.length }) : null}
          />
        ) : null}
      </div>
      <Freshness f={data.freshness} t={t} locale={locale} />
    </>
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
 */
export function CustomersTab({ data }: { data: RestaurantCustomersPage }) {
  const t = useTranslations('restaurantReports');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.bills === 0) return <p className="rr-empty">{t('empty')}</p>;
  if (data.lowCapture) {
    return (
      <section className="cr-card rr-card" aria-labelledby="rr-guests-h">
        <h2 className="cr-label" id="rr-guests-h">{t('customers.cameBack')}</h2>
        <p className="rr-line">{t('customers.lowCapture')}</p>
        <p className="rr-more">{t('customers.lowCaptureFrom', { pct: data.capturePct })}</p>
      </section>
    );
  }
  if (data.guestCount === 0) return <p className="rr-empty">{t('customers.empty')}</p>;
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="rr-guests-h">
        <h2 className="cr-label" id="rr-guests-h">{t('customers.cameBack')}</h2>
        <p className="cr-hero">{data.cameBack.value.toLocaleString(intlLocale(locale))}</p>
        <Delta c={data.cameBack} t={t} />
        <div className="rr-smalls">
          <Small label={t('customers.newGuests')} value={data.newGuests.value.toLocaleString(intlLocale(locale))} />
          <Small label={t('customers.withNumber')} value={t('customers.withNumberValue', { pct: data.capturePct })} />
        </div>
      </section>
      <div className="rr-lists">
        <List
          title={t('customers.top')}
          rows={data.top.map((g, i) => ({
            key: g.customerId ?? String(i),
            name: g.name ?? t('customers.hidden'),
            note: t('customers.visits', { n: g.visits }),
            value: g.salesMinor === null ? '' : money(g.salesMinor),
          }))}
          more={t('customers.perBranch')}
        />
      </div>
    </>
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
                <span className="rr-tip-sure">{t(`sure.${tip.sure}`, { n: tip.bills })}</span>
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

  const load = useCallback(async () => {
    if (!ready) return;
    const mine = ++seq.current;
    setFailed(false);
    setCancelled(null);
    const forKey = key;
    const q = { from: dates.fromISO, to: dates.toISO, location: branch || undefined };
    try {
      let res: unknown;
      if (tab === 'tips') res = await api.restaurantReport<RestaurantTipsPage>('tips', q);
      else if (tab === 'customers') res = await api.restaurantReport<RestaurantCustomersPage>('customers', q);
      else if (tab === 'inventory') {
        const days = Math.round((Date.parse(dates.toISO) - Date.parse(dates.fromISO)) / 86_400_000) + 1;
        res = days > 92 ? 'too_long' : await api.foodCostReport(q).catch(() => 'failed' as const);
      } else res = await api.restaurantReport(tab, q);
      if (mine === seq.current) setLoaded({ key: forKey, value: res });
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  }, [ready, dates.fromISO, dates.toISO, branch, tab, key]);
  useEffect(() => {
    void load();
  }, [load]);

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
    setCancelled('loading');
    try {
      setCancelled(await api.restaurantReport<RestaurantCancelledPage>('cancelled', { from: dates.fromISO, to: dates.toISO, location: branch || undefined }));
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
          <button type="button" className="btn" onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      ) : data === null ? (
        <div className="cr-card cr-skeleton" aria-busy="true" />
      ) : tab === 'overview' ? (
        <OverviewTab data={data as RestaurantOverviewPage} />
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
