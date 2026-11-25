'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '../lib/api';
import type {
  RestaurantCompared,
  SalonChairsPage,
  SalonLoyaltyPage,
  SalonClientsPage,
  SalonOverviewPage,
  SalonPersonRow,
  SalonSalesPage,
  SalonServiceRow,
  SalonServicesPage,
  SalonTeamPage,
  SalonTip,
  SalonTipsPage,
} from '../lib/api-types';
import { intlLocale } from '../lib/format';
import { IconChevronRight, IconClock, IconLightbulb, IconScissors, IconUser, IconWhatsApp } from '../components/icons';
import { whatsappHref } from '../lib/receipt-text';
import { useNoProvider } from '../lib/use-no-provider';
import { useLabel } from '../components/LabelsProvider';
import { nounInSentence, pickNoun } from '../lib/nouns';
import { Avatar } from '../components/home/parts';
import { useBranch } from '../components/BranchProvider';
import { useSession } from '../components/SessionProvider';
import { ReportDates } from './ReportDates';
import { Bars, List, rupees, Small } from './RestaurantReports';
import { FIXED_WINDOW_TABS, SALON_TABS, type SalonTab } from './salon-tabs';
import { Heatmap } from './charts/Heatmap';
import { fetchOnce, freshFor, isFresh, peek } from './report-cache';
import { type ChangedEnd, clampReportRange, defaultReportRange, todayInZone } from '../lib/report-dates';

export type { SalonTab };

/**
 * The salon's Reports, in the restaurant's simple tabs (Jira GRW-758's layout and colours): Overview · Sales · Services ·
 * Team · Clients · Tips.
 *
 * The same owner rule, 2026-11-24 — "very clean and precise, not too much noise", in easy English:
 *   - each tab is ONE big number, at most three small figures, one chart and lists of five;
 *   - each fact appears once across the tabs;
 *   - a row or figure that is zero or empty is left out, not drawn as "₹0";
 *   - under a figure, one line only; no sentences, no advice (advice is the Tips tab's);
 *   - exact rupees, Indian commas, whole-number percentages.
 *
 * A diary's perspective: a visit instead of a bill, a service instead of a dish, the person who did it, and the client who
 * has not come back. The charts, lists and figures are the restaurant's own components and CSS (`rr-*`), so the two
 * verticals read alike; the API sends figures only and every word is written here, in English or Hindi.
 */

type Money = (minor: number | null) => string;
const LIST_SHOWN = 5;

/**
 * The vertical's own nouns (CLAUDE.md: every dashboard-visible noun comes from `ctx.labels`): a clinic's "Patients", a
 * spa's "therapist". English takes the label; Hindi keeps its generic word until verticals carry a noun per language
 * (`pickNoun`, as `useNoProvider` does). Passed to every string that names clients or the people who serve them.
 */
function useNouns() {
  const locale = useLocale();
  const customers = pickNoun(locale, useLabel('customers', 'Clients'), 'ग्राहक');
  const provider = pickNoun(locale, useLabel('provider', 'Stylist'), 'स्टाफ़');
  return { customers, customersLower: nounInSentence(customers), providerLower: nounInSentence(provider) };
}
const MODE_WORDS = { cash: 'mode.cash', upi: 'mode.upi', card: 'mode.card', other: 'mode.other', not_recorded: 'mode.not_recorded' } as const;

type DeltaWords = (key: 'delta.up' | 'delta.down' | 'delta.same', values?: { pct: number }) => string;
function Delta({ c, t }: { c: RestaurantCompared; t: DeltaWords }) {
  if (c.changePct === null) return null;
  const pct = Math.round(Math.abs(c.changePct));
  if (pct === 0) return <p className="rr-delta">{t('delta.same')}</p>;
  const up = c.changePct > 0;
  return <p className={`rr-delta ${up ? 'is-up' : 'is-down'}`}>{t(up ? 'delta.up' : 'delta.down', { pct })}</p>;
}

/** Days as the restaurant's chart names them: the first and last with their month, a short window's days by date alone. */
function dayPoints(byDay: Array<{ day: string; salesMinor: number }>, locale: string) {
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dateOnly = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', timeZone: 'UTC' });
  const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const last = byDay.length - 1;
  return byDay.map((d, i) => ({
    key: d.day,
    tick: i === 0 || i === last ? day.format(asDate(d.day)) : byDay.length <= 8 ? dateOnly.format(asDate(d.day)) : (last - i) % 7 === 0 && i >= 3 ? day.format(asDate(d.day)) : '',
    full: weekday.format(asDate(d.day)),
    minor: d.salesMinor,
    weekend: [0, 6].includes(asDate(d.day).getUTCDay()),
  }));
}

const hourNamer = (locale: string) => {
  const hour = new Intl.DateTimeFormat(intlLocale(locale), { hour: 'numeric', timeZone: 'UTC' });
  return (h: number) => hour.format(new Date(Date.UTC(2026, 0, 5, h % 24)));
};

/** One button-or-row in "Worth a look": opens its tab, read from the top. */
function WorthRow({ icon, main, sub, onOpen }: { icon: ReactNode; main: string; sub: string; onOpen?: () => void }) {
  const inner = (
    <>
      <span className="rr-worth-icon" aria-hidden="true">{icon}</span>
      <span className="rr-worth-text">
        <span className="rr-worth-main">{main}</span>
        <span className="rr-worth-sub">{sub}</span>
      </span>
    </>
  );
  if (!onOpen) return <div className="rr-worth-row">{inner}</div>;
  return (
    <button
      type="button"
      className="rr-worth-row"
      onClick={(e) => {
        // The page scrolls inside `.page-body` (use-fit-rows.ts), not the window.
        const scroller = e.currentTarget.closest('.page-body');
        onOpen();
        (scroller ?? window).scrollTo({ top: 0 });
      }}
    >
      {inner}
      <span className="rr-worth-go" aria-hidden="true"><IconChevronRight /></span>
    </button>
  );
}

/* ───────────────────────────── Overview ───────────────────────────── */

export function SalonOverviewTab({
  data,
  todayISO,
  tipCount = null,
  onOpen,
  hasTeam = true,
}: {
  data: SalonOverviewPage;
  todayISO?: string;
  tipCount?: number | null;
  onOpen?: (tab: SalonTab) => void;
  /** Whether the Team tab exists (a clinic ranks no doctor): "earned most" opens it only then. */
  hasTeam?: boolean;
}) {
  const t = useTranslations('salonReports');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.sales.value === 0 && data.visits.value === 0 && data.noShows.count === 0) return <p className="rr-empty">{t('empty')}</p>;
  const points = dayPoints(data.byDay, locale);
  const both = points.some((p) => p.weekend) && points.some((p) => !p.weekend);
  const n = (v: number) => v.toLocaleString(intlLocale(locale));
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="sr-sales-h">
        <div className="rr-lead">
          <h2 className="cr-label" id="sr-sales-h">{t('overview.sales')}</h2>
          <p className="cr-hero">{money(data.sales.value)}</p>
          <Delta c={data.sales} t={t} />
        </div>
        <div className="rr-smalls">
          <Small label={t('overview.visits')} value={n(data.visits.value)} />
          {data.noShows.count > 0 ? (
            <Small
              label={t('overview.noShows')}
              value={data.noShows.minor > 0 ? t('overview.noShowsValue', { n: data.noShows.count, amount: money(data.noShows.minor) }) : n(data.noShows.count)}
              sub={t('overview.noShowsSub')}
            />
          ) : null}
        </div>
        <Bars points={points} money={money} label={t('overview.byDay')} today={todayISO ? { key: todayISO, word: t('overview.today') } : undefined} />
        {both ? (
          <p className="rr-legend" aria-hidden="true">
            <span className="rr-key">{t('overview.weekdays')}</span>
            <span className="rr-key is-weekend">{t('overview.weekend')}</span>
          </p>
        ) : null}
      </section>
      <OverviewMore data={data} tipCount={tipCount} onOpen={onOpen} money={money} hasTeam={hasTeam} />
    </>
  );
}

/** Under the chart: where the money came from (two sources or more), and up to four one-line highlights that open their tab. */
function OverviewMore({ data, tipCount, onOpen, money, hasTeam }: { data: SalonOverviewPage; tipCount: number | null; onOpen?: (tab: SalonTab) => void; money: Money; hasTeam: boolean }) {
  const t = useTranslations('salonReports');
  const locale = useLocale();
  const parts = data.sources.filter((x) => x.salesMinor > 0);
  const total = parts.reduce((n, x) => n + x.salesMinor, 0);
  const hourName = hourNamer(locale);
  const noOne = useNoProvider();
  const open = (tab: SalonTab) => (onOpen ? () => onOpen(tab) : undefined);
  const rows: Array<{ key: string; icon: ReactNode; main: string; sub: string; go?: () => void }> = [];
  if (data.topService) {
    rows.push({
      key: 'service',
      icon: <IconScissors />,
      main: t('overview.topService', { name: data.topService.name }),
      sub: t('overview.topServiceSub', { n: data.topService.count, amount: money(data.topService.salesMinor) }),
      go: open('services'),
    });
  }
  if (data.topPerson) {
    rows.push({
      key: 'person',
      icon: <IconUser />,
      main: t('overview.topPerson', { name: data.topPerson.key === 'unassigned' ? noOne : data.topPerson.name }),
      sub: t('overview.topPersonSub', { n: data.topPerson.visits, amount: money(data.topPerson.salesMinor) }),
      go: hasTeam ? open('team') : undefined,
    });
  }
  if (data.busiest) {
    rows.push({
      key: 'busy',
      icon: <IconClock />,
      main: t('overview.busiest', { from: hourName(data.busiest.hour), to: hourName(data.busiest.hour + 1) }),
      sub: t('overview.busiestSub', { n: data.busiest.visits, pct: data.busiest.sharePct }),
      go: open('sales'),
    });
  }
  if (tipCount !== null && tipCount > 0) {
    rows.push({ key: 'tips', icon: <IconLightbulb />, main: t('overview.tips', { n: tipCount }), sub: t('overview.tipsSub'), go: open('tips') });
  }
  if (parts.length < 2 && rows.length === 0) return null;
  return (
    <div className="rr-lists rr-more-cards">
      {parts.length >= 2 ? (
        <section className="rr-list rr-sources" aria-labelledby="sr-sources-h">
          <h3 className="rr-list-title" id="sr-sources-h">{t('overview.sources')}</h3>
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
                  {t(`source.${x.key}`)}
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
        <section className="rr-list rr-worth" aria-labelledby="sr-worth-h">
          <h3 className="rr-list-title" id="sr-worth-h">{t('overview.worth')}</h3>
          <ul>
            {rows.map((r) => (
              <li key={r.key}>
                <WorthRow icon={r.icon} main={r.main} sub={r.sub} onOpen={r.go} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── Sales ───────────────────────────── */

export function SalonSalesTab({ data }: { data: SalonSalesPage }) {
  const t = useTranslations('salonReports');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.averageVisit === null && data.byPayment.length === 0) return <p className="rr-empty">{t('empty')}</p>;
  const hourName = hourNamer(locale);
  const sold = data.busyHours.filter((h) => h.salesMinor > 0);
  const first = sold.length ? sold[0]!.hour : 0;
  const last = sold.length ? sold[sold.length - 1]!.hour : -1;
  const by = new Map(data.busyHours.map((h) => [h.hour, h.salesMinor]));
  const points = [];
  for (let h = first; h <= last; h++) points.push({ key: String(h), tick: h === first || h === last || (h - first) % 3 === 0 ? hourName(h) : '', full: hourName(h), minor: by.get(h) ?? 0 });
  const modeName = (mode: string) => (mode in MODE_WORDS ? t(MODE_WORDS[mode as keyof typeof MODE_WORDS]) : mode);
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="sr-money-h">
        <div className="rr-lead">
          {/* What a visit was worth. Not "Money in": in a salon that is the Overview's Sales to the rupee, and each fact
              appears once. How it was paid is the list below, which adds up to Sales. */}
          {/* No completed visit (a week of counter sales only): no average at all, never "₹0, ↓ 100%". */}
          <h2 className="cr-label" id="sr-money-h">{t('sales.average')}</h2>
          {data.averageVisit ? (
            <>
              <p className="cr-hero">{money(data.averageVisit.value)}</p>
              <Delta c={data.averageVisit} t={t} />
            </>
          ) : (
            <p className="rr-line">{t('sales.noVisits')}</p>
          )}
        </div>
        {data.discountsMinor > 0 || data.refundsMinor > 0 ? (
          <div className="rr-smalls">
            {data.discountsMinor > 0 ? <Small label={t('sales.discounts')} value={money(data.discountsMinor)} /> : null}
            {data.refundsMinor > 0 ? <Small label={t('sales.refunds')} value={money(data.refundsMinor)} /> : null}
          </div>
        ) : null}
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
          rows={data.byPayment.filter((p) => p.minor !== 0).slice(0, LIST_SHOWN).map((p) => ({ key: p.mode, name: modeName(p.mode), value: money(p.minor) }))}
        />
      </div>
    </>
  );
}

/* ───────────────────────────── Services ───────────────────────────── */

export function SalonServicesTab({ data }: { data: SalonServicesPage }) {
  const t = useTranslations('salonReports');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.servicesDone.value === 0 && data.cancelled.count === 0 && data.products.count === 0 && data.packages.count === 0) return <p className="rr-empty">{t('empty')}</p>;
  const n = (v: number) => v.toLocaleString(intlLocale(locale));
  const more = data.doneCount - data.top.length;
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="sr-done-h">
        <div className="rr-lead">
          <h2 className="cr-label" id="sr-done-h">{t('services.done')}</h2>
          <p className="cr-hero">{n(data.servicesDone.value)}</p>
          <Delta c={data.servicesDone} t={t} />
        </div>
        {data.cancelled.count > 0 ? (
          <div className="rr-smalls">
            <Small
              label={t('services.cancelled')}
              value={data.cancelled.minor > 0 ? t('services.cancelledValue', { n: data.cancelled.count, amount: money(data.cancelled.minor) }) : n(data.cancelled.count)}
              sub={t('services.cancelledSub')}
            />
          </div>
        ) : null}
        {data.top.length > 0 ? <TopServices data={data} money={money} more={more} /> : null}
      </section>
      <div className="rr-lists rr-items-lists">
        {data.movers.length > 0 ? (
          <List
            title={t('services.movers')}
            sub={t('services.moversSub')}
            rows={data.movers.map((d) => ({
              key: d.name,
              name: d.name,
              note: t('services.moversNote', { now: d.count, before: d.previousCount }),
              value: d.diff > 0 ? `↑ ${d.diff}` : `↓ ${-d.diff}`,
              tone: d.diff > 0 ? 'up' : 'down',
            }))}
          />
        ) : null}
        {data.packages.count > 0 ? (
          <List
            title={t('services.packages')}
            sub={t('services.packagesSub')}
            rows={data.packages.rows.map((p) => ({ key: p.name, name: p.name, note: t('services.times', { n: p.count }), value: money(p.minor) }))}
            more={data.packages.count > data.packages.rows.length ? t('services.moreProducts', { n: data.packages.count - data.packages.rows.length }) : null}
          />
        ) : null}
        {data.products.count > 0 ? (
          <List
            title={t('services.products')}
            sub={t('services.productsSub')}
            rows={data.products.rows.map((p) => ({ key: p.name, name: p.name, note: t('services.qty', { n: p.qty }), value: money(p.minor) }))}
            more={data.products.count > data.products.rows.length ? t('services.moreProducts', { n: data.products.count - data.products.rows.length }) : null}
          />
        ) : null}
        {data.barelyBooked.count > 0 ? (
          <List
            title={t('services.barely')}
            sub={t('services.barelySub')}
            rows={data.barelyBooked.rows.map((r) => ({ key: r.name, name: r.name, value: r.count === 0 ? t('services.barelyNone') : t('services.barelyOnce'), tone: 'quiet' as const }))}
            more={data.barelyBooked.count > data.barelyBooked.rows.length ? t('services.barelyMore', { n: data.barelyBooked.count, menu: data.barelyBooked.menuTotal }) : null}
          />
        ) : null}
      </div>
    </>
  );
}

/** The top five services as bars, by Sales or by times done — the restaurant's top-dishes chart and its pill switch. */
function TopServices({ data, money, more }: { data: SalonServicesPage; money: Money; more: number }) {
  const t = useTranslations('salonReports.services');
  const [by, setBy] = useState<'sales' | 'count'>('sales');
  const rows = by === 'count' ? data.topByCount : data.top;
  const value = (d: SalonServiceRow) => (by === 'sales' ? d.salesMinor : d.count);
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className="rr-topdishes">
      <div className="rr-topdishes-head">
        <h3 className="rr-list-title">{t('top')}</h3>
        <div className="rr-rank-by" role="group" aria-label={t('rankBy')}>
          {(['sales', 'count'] as const).map((k) => (
            <button key={k} type="button" className={`srp-nav-tab ${by === k ? 'is-active' : ''}`} aria-pressed={by === k} onClick={() => setBy(k)}>
              {t(k === 'sales' ? 'bySales' : 'byCount')}
            </button>
          ))}
        </div>
      </div>
      <ul className="cr-rows rr-hbars">
        {rows.map((d) => (
          <li key={`${d.id ?? ''}|${d.name}`} className="cr-row">
            <span className="cr-row-line">
              <span className="cr-row-name">
                <span className="rr-hbar-name">{d.name}</span>
                {by === 'sales' ? <span className="rr-list-note">{t('times', { n: d.count })}</span> : null}
              </span>
              <span className="cr-row-money">{by === 'sales' ? money(d.salesMinor) : t('times', { n: d.count })}</span>
            </span>
            <span className="cr-row-track" aria-hidden="true">
              <span className="cr-row-fill" style={{ width: `${Math.max(2, (value(d) / max) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="rr-more">{t('moreDone', { n: more })}</p> : null}
    </div>
  );
}

/* ───────────────────────────── Team ───────────────────────────── */

export function SalonTeamTab({ data }: { data: SalonTeamPage }) {
  const t = useTranslations('salonReports');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.people.length === 0) return <p className="rr-empty">{t('empty')}</p>;
  const n = (v: number) => v.toLocaleString(intlLocale(locale));
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="sr-team-h">
        {/* How much of the team's time was booked. Not the team's sales: with no products sold that is the Overview's Sales
            again, and each person's sales are the bars below. No hours set: the people who worked lead instead. */}
        {data.busyPct !== null ? (
          <>
            <div className="rr-lead">
              <h2 className="cr-label" id="sr-team-h">{t('team.busy')}</h2>
              <p className="cr-hero">{t('team.busyValue', { pct: data.busyPct })}</p>
              {data.previousBusyPct !== null ? <p className="rr-delta">{t('team.busyBefore', { pct: data.previousBusyPct })}</p> : null}
            </div>
            <div className="rr-smalls">
              <Small label={t('team.working')} value={n(data.working)} />
            </div>
          </>
        ) : (
          <div className="rr-lead">
            <h2 className="cr-label" id="sr-team-h">{t('team.working')}</h2>
            <p className="cr-hero">{n(data.working)}</p>
          </div>
        )}
        <TopPeople people={data.people} money={money} />
      </section>
    </>
  );
}

/** Who earned it: five people as bars, by Sales or by visits; their visits, a visit's worth and how booked they were, under the name. */
function TopPeople({ people, money }: { people: SalonPersonRow[]; money: Money }) {
  const t = useTranslations('salonReports');
  const [by, setBy] = useState<'sales' | 'visits'>('sales');
  const [all, setAll] = useState(false);
  const noOne = useNoProvider();
  const ranked = [...people].sort((a, b) => (by === 'sales' ? b.salesMinor - a.salesMinor || b.visits - a.visits : b.visits - a.visits || b.salesMinor - a.salesMinor));
  const rows = all ? ranked : ranked.slice(0, LIST_SHOWN);
  const value = (p: SalonPersonRow) => (by === 'sales' ? p.salesMinor : p.visits);
  const max = Math.max(1, ...rows.map(value));
  const note = (p: SalonPersonRow) =>
    [
      by === 'sales' ? t('team.visits', { n: p.visits }) : null,
      p.averageMinor !== null && p.visits > 1 ? t('team.average', { amount: money(p.averageMinor) }) : null,
      p.busyPct !== null ? t('team.busyNote', { pct: p.busyPct }) : null,
      p.noShowPct ? t('team.noShowNote', { pct: p.noShowPct }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  return (
    <div className="rr-topdishes">
      <div className="rr-topdishes-head">
        <h3 className="rr-list-title">{t('team.top')}</h3>
        <div className="rr-rank-by" role="group" aria-label={t('team.rankBy')}>
          {(['sales', 'visits'] as const).map((k) => (
            <button key={k} type="button" className={`srp-nav-tab ${by === k ? 'is-active' : ''}`} aria-pressed={by === k} onClick={() => setBy(k)}>
              {t(k === 'sales' ? 'team.bySales' : 'team.byVisits')}
            </button>
          ))}
        </div>
      </div>
      <ul className="cr-rows rr-hbars">
        {rows.map((p) => (
          <li key={p.id} className="cr-row">
            <span className="cr-row-line">
              <span className="cr-row-name">
                <span className="rr-hbar-name">{p.key === 'unassigned' ? noOne : p.name}</span>
                {note(p) ? <span className="rr-list-note">{note(p)}</span> : null}
              </span>
              <span className="cr-row-money">{by === 'sales' ? money(p.salesMinor) : t('team.visits', { n: p.visits })}</span>
            </span>
            <span className="cr-row-track" aria-hidden="true">
              <span className="cr-row-fill" style={{ width: `${Math.max(2, (value(p) / max) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      {!all && ranked.length > LIST_SHOWN ? (
        <button type="button" className="btn btn-ghost rr-see-all" onClick={() => setAll(true)}>
          {t('clients.overdueAll', { n: ranked.length })}
        </button>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── Chairs ───────────────────────────── */

/** Monday 5 Jan 2026 is a Monday: weekday `dow` (1 Monday … 7 Sunday) is that date plus dow − 1. */
const weekdayNamer = (locale: string, weekday: 'short' | 'long') => {
  const f = new Intl.DateTimeFormat(intlLocale(locale), { weekday, timeZone: 'UTC' });
  return (dow: number) => f.format(new Date(Date.UTC(2026, 0, 4 + dow)));
};

/**
 * When the chairs were empty: working hours (less time off) nobody was booked into. The grid is the Bookings tab's heatmap,
 * coloured by the share of working time booked; an hour nobody works is left blank, never painted as an empty chair.
 */
export function SalonChairsTab({ data }: { data: SalonChairsPage }) {
  const t = useTranslations('salonReports.chairs');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.tooLong) return <p className="rr-empty">{t('tooLong')}</p>;
  if (data.emptyHours === null) return <p className="rr-empty">{t('noHours')}</p>;
  const day = weekdayNamer(locale, 'short');
  const hourName = hourNamer(locale);
  const dows = [...new Set(data.grid.map((g) => g.dow))].sort((a, b) => a - b);
  const first = Math.min(...data.grid.map((g) => g.hour));
  const last = Math.max(...data.grid.map((g) => g.hour));
  const hours: number[] = [];
  for (let h = first; h <= last; h++) hours.push(h);
  const cell = new Map(data.grid.map((g) => [`${g.dow}|${g.hour}`, g.pct]));
  const grid = dows.map((d) => hours.map((h) => (cell.has(`${d}|${h}`) ? cell.get(`${d}|${h}`)! / 100 : Number.NaN)));
  const n = (v: number) => v.toLocaleString(intlLocale(locale));
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="sr-chairs-h">
        <div className="rr-lead">
          <h2 className="cr-label" id="sr-chairs-h">{t('empty')}</h2>
          <p className="cr-hero">{t('emptyValue', { n: data.emptyHours })}</p>
          <p className="rr-delta">{t('of', { n: n(data.workingHours) })}</p>
        </div>
        <div className="rr-smalls">
          {data.perBookedHourMinor !== null ? <Small label={t('perHour')} value={money(data.perBookedHourMinor)} /> : null}
          {data.busiestDay ? <Small label={t('busiest')} value={t('dayValue', { day: day(data.busiestDay.dow), pct: data.busiestDay.pct })} /> : null}
          {data.quietestDay ? <Small label={t('quietest')} value={t('dayValue', { day: day(data.quietestDay.dow), pct: data.quietestDay.pct })} /> : null}
        </div>
        <div className="rr-chart">
          <h3 className="rr-list-title">{t('grid')}</h3>
          <p className="rr-more rr-list-sub">{t('gridSub')}</p>
          <Heatmap
            days={dows.map(day)}
            hours={hours.map(hourName)}
            grid={grid}
            quietWord={t('quiet')}
            busyWord={t('busy')}
            describe={(d, h, v) => (Number.isNaN(v) ? t('notWorked', { day: d, hour: h }) : t('cell', { day: d, hour: h, pct: Math.round(v * 100) }))}
          />
        </div>
      </section>
      <div className="rr-lists">
        <List
          title={t('emptiest')}
          sub={t('emptiestSub')}
          rows={data.emptiest.map((s) => ({
            key: `${s.dow}|${s.hour}`,
            name: t('slot', { day: day(s.dow), from: hourName(s.hour), to: hourName(s.hour + 1) }),
            note: t('slotNote', { pct: s.pct }),
            value: t('slotValue', { n: s.emptyHours }),
          }))}
        />
        <List
          title={t('people')}
          sub={t('peopleSub')}
          rows={data.people.filter((p) => p.emptyHours > 0).map((p) => ({ key: p.id, name: p.name, note: t('slotNote', { pct: p.pct }), value: t('slotValue', { n: p.emptyHours }) }))}
        />
      </div>
    </>
  );
}

/* ───────────────────────────── Clients ───────────────────────────── */

export function SalonClientsTab({ data }: { data: SalonClientsPage }) {
  const nouns = useNouns();
  const t = useTranslations('salonReports');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.clientCount === 0 && data.overdue.count === 0) return <p className="rr-empty">{t('clients.empty')}</p>;
  const n = (v: number) => v.toLocaleString(intlLocale(locale));
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="sr-clients-h">
        <div className="rr-lead">
          <h2 className="cr-label" id="sr-clients-h">{t('clients.cameBack', nouns)}</h2>
          <p className="cr-hero">{n(data.cameBack.value)}</p>
          <Delta c={data.cameBack} t={t} />
        </div>
        <div className="rr-smalls">
          <Small label={t('clients.newClients', nouns)} value={n(data.newClients.value)} />
          {data.topShare ? <Small label={t('clients.topShare')} value={t('clients.topShareValue', { pct: data.topShare.pct })} /> : null}
        </div>
        {data.returnByMonth.some((m) => m.newGuests > 0) ? <MonthReturns months={data.returnByMonth} days={data.returnDays} /> : null}
      </section>
      <div className="rr-lists">
        {data.overdue.count > 0 ? <Overdue overdue={data.overdue} /> : null}
        <TopClients top={data.top} money={money} />
      </div>
    </>
  );
}

/** Of each month's new clients (by their first visit), the share who came back within 60 days — the restaurant's chart. */
function MonthReturns({ months: all, days }: { months: SalonClientsPage['returnByMonth']; days: number }) {
  const t = useTranslations('salonReports.clients');
  const locale = useLocale();
  const monthName = new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', timeZone: 'UTC' });
  const name = (ym: string) => monthName.format(new Date(`${ym}-01T00:00:00Z`));
  const start = all.findIndex((m) => m.newGuests > 0);
  const months = start < 0 ? [] : all.slice(start);
  const best = Math.max(0, ...months.map((m) => m.pct ?? 0));
  const said = months.filter((m) => m.pct !== null);
  const settled = said.filter((m) => !m.partial);
  const over = settled.length > 0 ? settled : said;
  const total = over.reduce((s, m) => s + m.newGuests, 0);
  const inTen = total > 0 ? Math.round((over.reduce((s, m) => s + m.cameBack, 0) / total) * 10) : null;
  return (
    <div className="rr-chart rr-returns">
      <h3 className="rr-list-title">{t('returnTitle', { days })}</h3>
      <p className="rr-more rr-returns-sub">{t('returnSub')}</p>
      <div className="rr-returns-body">
        {inTen !== null ? (
          <div className="rr-returns-stat">
            <p className="rr-stat-big">{inTen === 0 ? t('returnStatLowBig') : t('returnStatBig', { n: inTen })}</p>
            <p className="rr-stat-text">{t('returnStatText', { days })}</p>
            <p className="rr-stat-months">
              {said.map((m) => t(m.partial ? 'returnStatMonthOpen' : 'returnStatMonth', { month: name(m.month), back: m.cameBack, n: m.newGuests })).join(' · ')}
            </p>
          </div>
        ) : null}
        <ul className="cr-bars cr-bars-day rr-bars" aria-label={t('returnTitle', { days })}>
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
 * Regulars away twice as long as they usually are, most valuable first. The WhatsApp button only opens a chat with their
 * number and a hello: the owner writes and sends it, nothing is sent for them. A client who sent STOP is never here.
 */
function Overdue({ overdue }: { overdue: SalonClientsPage['overdue'] }) {
  const nouns = useNouns();
  const t = useTranslations('salonReports.clients');
  const [all, setAll] = useState(false);
  const title = (
    <h3 className="rr-list-title" id="sr-overdue-h">
      {t('overdueTitle', nouns)} <span className="rr-list-count">· {overdue.count}</span>
    </h3>
  );
  if (overdue.rows.length === 0) {
    return (
      <section className="rr-list" aria-labelledby="sr-overdue-h">
        {title}
        <p className="rr-line">{t('overdueCount', { n: overdue.count })}</p>
      </section>
    );
  }
  const rows = all ? overdue.rows : overdue.rows.slice(0, LIST_SHOWN);
  return (
    <section className="rr-list rr-people rr-overdue" aria-labelledby="sr-overdue-h">
      {title}
      <p className="rr-more rr-overdue-sub">{t('overdueSub')}</p>
      <ul>
        {rows.map((g) => (
          <li key={g.customerId}>
            <Avatar name={g.name} id={g.customerId} size={36} />
            <span className="rr-list-name">
              {g.name ?? t('hidden')}
              <span className="rr-list-note">{t('overdueUsual', { gap: g.usualGapDays })}</span>
            </span>
            <span className="rr-away">{t('overdueAway', { n: g.lastSeenDaysAgo })}</span>
            <a
              className="rr-wa"
              href={whatsappHref(g.phone.replace(/\D/g, ''), t('overdueHello', { name: g.name ?? '' }).trim())}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('overdueWaAria', { name: g.name ?? t('hidden') })}
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

function TopClients({ top, money }: { top: SalonClientsPage['top']; money: Money }) {
  const nouns = useNouns();
  const t = useTranslations('salonReports.clients');
  if (top.length === 0) return null;
  return (
    <section className="rr-list rr-people rr-top-guests" aria-labelledby="sr-top-h">
      <h3 className="rr-list-title" id="sr-top-h">{t('top', nouns)}</h3>
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
    </section>
  );
}

/* ───────────────────────────── Loyalty ───────────────────────────── */

/**
 * Do clients stay? The rebooking rate (the next visit booked within 7 days), over visits whose 7 days are over; a year's
 * habit; how many of each month's new clients still come in months 1–6; rebooking by stylist; when clients come back.
 */
export function SalonLoyaltyTab({ data }: { data: SalonLoyaltyPage }) {
  const nouns = useNouns();
  const t = useTranslations('salonReports.loyalty');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const asDay = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
  const curve = data.curve.filter((m) => m.clients > 0);
  const best = Math.max(0, ...curve.map((m) => m.pct ?? 0));
  const n = (v: number) => v.toLocaleString(intlLocale(locale));
  return (
    <>
      <p className="rr-more rr-tip-window">{t('window', { from: asDay(data.windows.from), to: asDay(data.windows.to) })}</p>
      <section className="cr-card rr-card" aria-labelledby="sr-rebook-h">
        <div className="rr-lead">
          <h2 className="cr-label" id="sr-rebook-h">{t('rebook')}</h2>
          {data.rebookPct === null ? (
            <p className="rr-line">{t('none')}</p>
          ) : (
            <>
              <p className="cr-hero">{t('rebookValue', { pct: data.rebookPct })}</p>
              <p className="rr-delta">{t('rebookOf', { n: n(data.rebooked), all: n(data.visits) })}</p>
              {data.previousRebookPct !== null ? <p className="rr-delta">{t('before', { pct: data.previousRebookPct })}</p> : null}
            </>
          )}
        </div>
        <div className="rr-smalls">
          {data.usualGapDays !== null ? <Small label={t('gap')} value={t('gapValue', { n: data.usualGapDays })} /> : null}
          {data.yearSpendPerClientMinor !== null ? <Small label={t('spend')} value={money(data.yearSpendPerClientMinor)} /> : null}
          {data.lost > 0 ? <Small label={t('lost')} value={n(data.lost)} sub={t('lostSub')} /> : null}
        </div>
        {curve.length > 0 ? (
          <div className="rr-chart rr-returns">
            <h3 className="rr-list-title">{t('curve')}</h3>
            <p className="rr-more rr-returns-sub">{t('curveSub')}</p>
            <ul className="cr-bars cr-bars-day rr-bars" aria-label={t('curve')}>
              {curve.map((m) => (
                <li key={m.month} className="cr-bar-col">
                  <span className={`cr-bar-top${m.pct !== null && m.pct === best ? ' is-peak' : ''}`} aria-hidden="true">
                    {m.pct === null ? '–' : `${m.pct}%`}
                  </span>
                  <span className="cr-bar-slot">
                    <span className={`cr-bar${m.pct !== null && m.pct === best ? ' is-peak' : ''}`} style={{ height: `${m.pct === null ? 0 : Math.max(2, m.pct)}%` }} />
                  </span>
                  <span className="cr-bar-tick" aria-hidden="true">{t('monthShort', { n: m.month })}</span>
                  <span className="sr-only">
                    {m.pct === null ? t('curveFew', { n: m.month, clients: m.clients }) : t('curveSr', { n: m.month, pct: m.pct, came: m.came, clients: m.clients })}
                  </span>
                </li>
              ))}
            </ul>
            {curve.some((m) => m.pct === null) ? <p className="rr-more">{t('curveFewNote')}</p> : null}
          </div>
        ) : null}
      </section>
      <div className="rr-lists">
        {data.people ? (
          <List
            title={t('people', nouns)}
            sub={t('peopleSub')}
            rows={data.people.map((p) => ({ key: p.id, name: p.name, note: t('visits', { n: p.visits }), value: t('rebookValue', { pct: p.rebookPct }) }))}
          />
        ) : null}
        <List
          title={t('gaps')}
          sub={t('gapsSub')}
          rows={data.serviceGaps.map((g) => ({ key: g.name, name: g.name, note: t('returns', { n: g.returns }), value: t('gapDays', { n: g.days }) }))}
        />
      </div>
    </>
  );
}

/* ───────────────────────────── Tips ───────────────────────────── */

const TIP_TAB: Record<SalonTip['rule'], SalonTab> = {
  sales_change: 'overview',
  no_shows: 'overview',
  overdue: 'clients',
  service_move: 'services',
  free_time: 'chairs',
};

/** At most three tips, each four short lines: what we saw, the numbers (both weeks), one thing to try, how sure we are. */
export function SalonTipsTab({ data, onOpen, tabs: open = SALON_TABS }: { data: SalonTipsPage; onOpen?: (tab: SalonTab) => void; tabs?: readonly SalonTab[] }) {
  const nouns = useNouns();
  const t = useTranslations('salonReports.tips');
  const tabs = useTranslations('salonReports.tabs');
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  if (data.tips.length === 0) return <p className="rr-empty">{data.visits < data.minVisits ? t('notEnough', { n: data.minVisits }) : t('normal')}</p>;
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const asDay = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
  const pct = (v: number) => Math.round(Math.abs(v));
  const card = (tip: SalonTip) => {
    const p = tip.payload;
    if (p.rule === 'sales_change') {
      const sameSpend = p.previousAverageVisit > 0 && Math.abs(p.averageVisit - p.previousAverageVisit) / p.previousAverageVisit <= 0.05;
      return {
        saw: t(p.pct >= 0 ? 'salesUp' : 'salesDown', { pct: pct(p.pct) }),
        numbers: t('salesNumbers', { now: money(p.sales), before: money(p.previousSales), visits: p.visits, prevVisits: p.previousVisits }),
        why: sameSpend && p.visits !== p.previousVisits ? t(p.visits < p.previousVisits ? 'fewerPeople' : 'morePeople') : null,
        tryThis: t(p.pct >= 0 ? 'salesTryUp' : 'salesTryDown'),
      };
    }
    if (p.rule === 'no_shows') {
      return {
        saw: t('noShowsTitle', { n: p.count }),
        numbers: [t('noShowsNumbers', { amount: money(p.minor), pct: p.ratePct }), p.previous === null ? null : t('noShowsBefore', { before: p.previous })]
          .filter(Boolean)
          .join(' '),
        why: null,
        tryThis: t('noShowsTry'),
      };
    }
    if (p.rule === 'overdue') return { saw: t('overdueTitle', { n: p.count }), numbers: t('overdueNumbers'), why: null, tryThis: t('overdueTry') };
    if (p.rule === 'service_move') {
      return {
        saw: t(p.count >= p.previousCount ? 'serviceUp' : 'serviceDown', { name: p.name }),
        numbers: t('serviceNumbers', { now: p.count, before: p.previousCount }),
        why: null,
        tryThis: t('serviceTry', { name: p.name }),
      };
    }
    return {
      saw: t('freeTitle', { name: p.name }),
      numbers: p.teamBusyPct !== null ? t('freeNumbersTeam', { pct: p.busyPct, team: p.teamBusyPct }) : t('freeNumbers', { pct: p.busyPct }),
      why: null,
      tryThis: t('freeTry', { name: p.name }),
    };
  };
  return (
    <>
      <p className="rr-more rr-tip-window">{t('window', { from: asDay(data.windows.from), to: asDay(data.windows.to) })}</p>
      <ol className="rr-tips">
        {data.tips.map((tip) => {
          const c = card(tip);
          const target = TIP_TAB[tip.rule];
          return (
            <li key={tip.rule} className="cr-card rr-tip">
              <p className="rr-tip-saw">{c.saw}</p>
              <p className="rr-tip-numbers">{c.numbers}</p>
              {c.why ? <p className="rr-tip-why">{c.why}</p> : null}
              <p className="rr-tip-try">{c.tryThis}</p>
              <div className="rr-tip-foot">
                <span className="rr-tip-sure">{t(`sure.${tip.sure}`, { n: tip.visits })}</span>
                {onOpen && open.includes(target) ? (
                  <button type="button" className="btn btn-ghost rr-tip-open" onClick={() => onOpen(target)}>
                    {t('open')} · {tabs(target, nouns)}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/* ───────────────────────────── The screen ───────────────────────────── */

export function SalonReports({ initialTab = 'overview', hasTeam = true }: { initialTab?: SalonTab; hasTeam?: boolean }) {
  const nouns = useNouns();
  const t = useTranslations('salonReports');
  const session = useSession();
  const todayISO = todayInZone(session?.timezone);
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;
  // A clinic ranks no doctor (`dashboard.staff_leaderboard`): no Team tab, not an empty one.
  // Team and Chairs both read each person's hours and takings; a clinic ranks no doctor, so it has neither.
  const tabs = SALON_TABS.filter((k) => (k !== 'team' && k !== 'chairs') || hasTeam);
  const [tab, setTab] = useState<SalonTab>(tabs.includes(initialTab) ? initialTab : 'overview');
  const [dates, setDates] = useState(() => defaultReportRange(todayISO));
  // Data is kept WITH the tab, dates and branch it was read for: a tab never draws another tab's payload (restaurant, d60ef035).
  const key = `${tab}|${dates.fromISO}|${dates.toISO}|${branch}`;
  const [loaded, setLoaded] = useState<{ key: string; value: unknown } | null>(null);
  const data = loaded?.key === key ? loaded.value : null;
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  // The browser keeps what a tab read (report-cache.ts), under who is signed in and where, as the restaurant's tabs do.
  const who = `salon|${session?.phone ?? ''}|${session?.businessName ?? ''}|${session?.role ?? ''}|${branches.map((b) => b.id).sort().join(',')}`;
  const q = useCallback(() => ({ from: dates.fromISO, to: dates.toISO, location: branch || undefined }), [dates.fromISO, dates.toISO, branch]);

  const load = useCallback(
    async (force = false) => {
      if (!ready) return;
      const mine = ++seq.current;
      const forKey = key;
      const cacheKey = `${who}|${forKey}`;
      setFailed(false);
      const hit = force ? undefined : peek<unknown>(cacheKey);
      if (hit) {
        setLoaded({ key: forKey, value: hit.value });
        if (isFresh(hit, freshFor(dates.toISO, todayISO))) return;
      }
      try {
        const res = await fetchOnce(cacheKey, () => api.salonReport<unknown>(tab, q()));
        if (mine === seq.current) setLoaded({ key: forKey, value: res });
      } catch {
        // A failed quiet refresh keeps the figures already on screen; only a first read shows the error.
        if (mine !== seq.current || hit) return;
        setFailed(true);
      }
    },
    [ready, dates.toISO, tab, key, who, todayISO, q],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // The Overview's "Worth a look" says how many tips there are this week, read under the Tips tab's own cache key.
  const [tipCount, setTipCount] = useState<number | null>(null);
  useEffect(() => {
    if (!ready || tab !== 'overview') return;
    let gone = false;
    const tipsKey = `${who}|tips|${dates.fromISO}|${dates.toISO}|${branch}`;
    const hit = peek<SalonTipsPage>(tipsKey);
    if (hit) setTipCount(hit.value.tips.length);
    if (hit && isFresh(hit, freshFor(dates.toISO, todayISO))) return;
    fetchOnce(tipsKey, () => api.salonReport<SalonTipsPage>('tips', q()))
      .then((r) => {
        if (!gone) setTipCount(r.tips.length);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [ready, tab, who, dates.fromISO, dates.toISO, branch, todayISO, q]);

  // The tab is in the address, so a reload or a shared link opens the same one.
  const choose = (k: SalonTab) => {
    setTab(k);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', k);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* the tab still changes */
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
            {t(`tabs.${k}`, nouns)}
          </button>
        ))}
      </nav>
      {/* Tips and Loyalty read fixed windows of their own (a visit's rebooking is judged once its 7 days are over): no dates to pick. */}
      <div className="cr-toolbar" hidden={FIXED_WINDOW_TABS.includes(tab)}>
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
        <SalonOverviewTab data={data as SalonOverviewPage} todayISO={todayISO} tipCount={tipCount} onOpen={choose} hasTeam={hasTeam} />
      ) : tab === 'sales' ? (
        <SalonSalesTab data={data as SalonSalesPage} />
      ) : tab === 'services' ? (
        <SalonServicesTab data={data as SalonServicesPage} />
      ) : tab === 'team' ? (
        <SalonTeamTab data={data as SalonTeamPage} />
      ) : tab === 'chairs' ? (
        <SalonChairsTab data={data as SalonChairsPage} />
      ) : tab === 'clients' ? (
        <SalonClientsTab data={data as SalonClientsPage} />
      ) : tab === 'loyalty' ? (
        <SalonLoyaltyTab data={data as SalonLoyaltyPage} />
      ) : (
        <SalonTipsTab data={data as SalonTipsPage} onOpen={choose} tabs={tabs} />
      )}
    </div>
  );
}
