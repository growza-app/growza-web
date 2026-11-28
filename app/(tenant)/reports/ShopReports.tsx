'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import AppLink from '../../shared/AppLink';
import { api } from '../lib/api';
import type {
  RestaurantCancelledPage,
  RestaurantCustomersPage,
  RestaurantItemsPage,
  RestaurantOverviewPage,
  RestaurantSalesPage,
  ReorderPage,
  ReturnsReportPage,
  StockReportPage,
} from '../lib/api-types';
import { intlLocale } from '../lib/format';
import { useBranch } from '../components/BranchProvider';
import { useAreas, useMayOpen, useSession } from '../components/SessionProvider';
import { sellsOnMarketplaces } from '../lib/order-channels';
import { ReportPeriod } from './ReportPeriod';
import { CustomersTab, ItemsTab, List, OverviewTab, ReportWordsContext, rupees, SalesTab, Small } from './RestaurantReports';
import type { RestaurantTab } from './restaurant-tabs';
import { SHOP_TABS, type ShopTab } from './shop-tabs';
import { fetchOnce, freshFor, isFresh, peek } from './report-cache';
import { type ChangedEnd, clampReportRange, defaultReportRange, todayInZone } from '../lib/report-dates';

type Money = (minor: number | null) => string;
type StockData = { report: StockReportPage; reorder: ReorderPage | null };

/**
 * Owner, 2026-11-28 — "implement the reports like we have in the restaurant: different graphs, information crisp and short".
 * A shop had eleven report screens, the same figures on three of them. It now reads six tabs, the restaurant's way: one
 * card on top (a big figure, the change, three small figures at most, one chart), then short lists of five.
 *
 *   Overview  — Sales, Orders, Average, Profit; sales by day; where sales came from (only with two sources); worth a look
 *   Sales     — Money in, Discounts, Refunds; busy hours; how people paid
 *   Customers — the restaurant's Guests tab in a shop's words
 *   Products  — items sold; top sellers by sales or by count; selling more or less; not selling
 *   Stock     — stock at cost price, on the shelf, to order; what to order first (no dates: a shelf is now)
 *   Returns   — money given back and how; what came back
 *
 * The full screens behind them (Stock report, Reorder list, Returns, Top sellers) stay one tap away for their tables,
 * exports and the order numbers an owner types.
 */
export function ShopReports({ initialTab = 'overview', from, to }: { initialTab?: ShopTab; from?: string; to?: string }) {
  const t = useTranslations('shopReports');
  const session = useSession();
  const mayOpen = useMayOpen();
  const areas = useAreas();
  const locale = useLocale();
  const money: Money = (m) => rupees(m, locale);
  const todayISO = todayInZone(session?.timezone);
  const branches = session?.branches ?? [];
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? (branchContext.choice ?? '') : '';
  const ready = branchContext.ready || branches.length <= 1;
  // A business with no counted shelf has no Stock tab; one that may not open Returns has no Returns tab.
  const tabs = SHOP_TABS.filter((k) => (k !== 'stock' || (areas.stock && mayOpen('/stock/report'))) && (k !== 'returns' || mayOpen('/orders/returns')));
  const [tab, setTab] = useState<ShopTab>(tabs.includes(initialTab) ? initialTab : 'overview');
  // A link may carry its days (`?from=…&to=…`, as the old report addresses did), held to what the reports answer.
  const [dates, setDates] = useState(() => (from && to ? clampReportRange(from, to, todayISO, 'to') : defaultReportRange(todayISO)));
  const dated = tab !== 'stock';
  const key = `${tab}|${dated ? `${dates.fromISO}|${dates.toISO}` : 'now'}|${branch}`;
  const [loaded, setLoaded] = useState<{ key: string; value: unknown } | null>(null);
  const data = loaded?.key === key ? loaded.value : null;
  const [failed, setFailed] = useState(false);
  const [cancelled, setCancelled] = useState<RestaurantCancelledPage | 'loading' | 'failed' | null>(null);
  const seq = useRef(0);
  const who = `shop|${session?.phone ?? ''}|${session?.businessName ?? ''}|${session?.role ?? ''}|${branches.map((b) => b.id).sort().join(',')}`;

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
        if (isFresh(hit, freshFor(dated ? dates.toISO : todayISO, todayISO))) return;
      }
      const location = branch || undefined;
      const q = { from: dates.fromISO, to: dates.toISO, location };
      const read = async (): Promise<unknown> => {
        if (tab === 'overview') return api.restaurantReport<RestaurantOverviewPage>('overview', q);
        if (tab === 'sales') return api.restaurantReport<RestaurantSalesPage>('sales', q);
        if (tab === 'customers') return api.restaurantReport<RestaurantCustomersPage>('customers', q);
        if (tab === 'products') return api.restaurantReport<RestaurantItemsPage>('items', q);
        if (tab === 'returns') return api.returnsReport({ range: 'custom', from: dates.fromISO, to: dates.toISO, location });
        const [report, reorder] = await Promise.all([
          api.stockReport({ location, pageSize: 1 }),
          mayOpen('/stock/order') ? api.reorder({ location, pageSize: 5 }).catch(() => null) : Promise.resolve(null),
        ]);
        return { report, reorder } satisfies StockData;
      };
      try {
        const res = await fetchOnce(cacheKey, read);
        if (mine === seq.current) setLoaded({ key: forKey, value: res });
      } catch {
        if (mine !== seq.current || hit) return;
        setFailed(true);
      }
    },
    // `mayOpen` is a fresh function each render; what it answers does not change while the screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, dates.fromISO, dates.toISO, branch, tab, key, who, todayISO, dated],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // The open tab is brought to the middle of the bar: on a phone the bar scrolls sideways, and Products, Stock and Returns
  // opened (from a link) with their own name off the right edge — RetailReportsNav does the same.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('.is-active');
    if (!nav || !current) return;
    nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
  }, [tab]);

  const choose = (k: ShopTab) => {
    setTab(k);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', k);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* the tab still changes */
    }
  };
  // The Overview's "Worth a look" rows name the restaurant's tabs: its Items is a shop's Products.
  const openFromOverview = (k: RestaurantTab) => choose(k === 'items' ? 'products' : k === 'sales' ? 'sales' : k === 'customers' ? 'customers' : 'overview');

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
    <ReportWordsContext.Provider value="shopReports">
      <div className="cr rr shr">
        <nav ref={navRef} className="srp-nav srp-nav-links rr-tabs" aria-label={t('tabsLabel')}>
          {tabs.map((k) => (
            <button key={k} type="button" className={`srp-nav-tab ${k === tab ? 'is-active' : ''}`} aria-current={k === tab ? 'page' : undefined} onClick={() => choose(k)}>
              {t(`tabs.${k}`)}
            </button>
          ))}
        </nav>
        {/* A shelf is counted now: the Stock tab has no dates to pick. */}
        <div className="cr-toolbar" hidden={!dated}>
          <ReportPeriod from={dates.fromISO} to={dates.toISO} today={todayISO} onChange={changeDates} />
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
          <OverviewTab data={data as RestaurantOverviewPage} todayISO={todayISO} onOpen={openFromOverview} />
        ) : tab === 'sales' ? (
          <SalesTab data={data as RestaurantSalesPage} />
        ) : tab === 'customers' ? (
          <CustomersTab data={data as RestaurantCustomersPage} words="shop" />
        ) : tab === 'products' ? (
          <>
            <ItemsTab data={data as RestaurantItemsPage} cancelled={cancelled} onOpenCancelled={() => void openCancelled()} />
            {mayOpen('/stock/sellers') ? (
              <div className="srp-links shr-links">
                <AppLink className="btn btn-ghost" href="/stock/sellers">
                  {t('items.seeAll')}
                </AppLink>
              </div>
            ) : null}
          </>
        ) : tab === 'stock' ? (
          <StockTab data={data as StockData} money={money} mayOpenOrder={mayOpen('/stock/order')} />
        ) : (
          <ReturnsTab data={data as ReturnsReportPage} money={money} ships={sellsOnMarketplaces(areas) && mayOpen('/orders/refunds')} />
        )}
      </div>
    </ReportWordsContext.Provider>
  );
}

/** What is on the shelf now, what it cost, and what to order first. */
function StockTab({ data, money, mayOpenOrder }: { data: StockData; money: Money; mayOpenOrder: boolean }) {
  const t = useTranslations('shopReports');
  const locale = useLocale();
  const n = (v: number) => v.toLocaleString(intlLocale(locale));
  const { totals } = data.report;
  if (totals.styles === 0) return <p className="rr-empty">{t('stock.empty')}</p>;
  const rows = (data.reorder?.rows ?? []).filter((r) => (r.order ?? 0) > 0).slice(0, 5);
  return (
    <>
      <section className="cr-card rr-card" aria-labelledby="shr-stock-h">
        <div className="rr-lead">
          <h2 className="cr-label" id="shr-stock-h">{t('stock.worth')}</h2>
          <p className="cr-hero">{money(Number(totals.valueMinor))}</p>
          {totals.sizesWithoutCost > 0 ? <p className="rr-more">{t('stock.noCost', { n: totals.sizesWithoutCost })}</p> : null}
        </div>
        <div className="rr-smalls">
          <Small label={t('stock.onShelf')} value={n(totals.units)} sub={t('stock.sizes', { n: totals.sizes })} />
          {data.reorder ? <Small label={t('stock.toOrder')} value={n(data.reorder.totals.toOrder)} sub={t('stock.toOrderSub', { n: data.reorder.totals.sizes })} /> : null}
        </div>
      </section>
      <div className="rr-lists">
        {data.reorder ? (
          rows.length > 0 ? (
            <List
              title={t('stock.runningOut')}
              rows={rows.map((r) => ({
                key: r.id,
                name: r.sizeLabel ? `${r.name} · ${r.sizeLabel}` : r.name,
                note: r.branchName,
                value: t('stock.order', { n: r.order ?? 0 }),
              }))}
            />
          ) : (
            <p className="rr-more">{t('stock.nothingToOrder')}</p>
          )
        ) : null}
      </div>
      <div className="srp-links shr-links">
        <AppLink className="btn btn-ghost" href="/stock/report">
          {t('stock.openReport')}
        </AppLink>
        {mayOpenOrder ? (
          <AppLink className="btn btn-ghost" href="/stock/order">
            {t('stock.openOrder')}
          </AppLink>
        ) : null}
      </div>
    </>
  );
}

const MODE_KEYS = new Set(['cash', 'upi', 'card', 'other', 'not_recorded']);

/** The money given back in these dates, how, and the last five things that came back. */
function ReturnsTab({ data, money, ships }: { data: ReturnsReportPage; money: Money; ships: boolean }) {
  const t = useTranslations('shopReports');
  const locale = useLocale();
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short' });
  const recent = (data.recent ?? []).slice(0, 5);
  const returns = data.customer.returns;
  const items = data.customer.units;
  return (
    <>
      {returns === 0 ? (
        <p className="rr-empty">{t('returns.none')}</p>
      ) : (
        <>
          <section className="cr-card rr-card" aria-labelledby="shr-ret-h">
            <div className="rr-lead">
              <h2 className="cr-label" id="shr-ret-h">{t('returns.givenBack')}</h2>
              <p className="cr-hero">{money(Number(data.refundMinor ?? 0))}</p>
              <p className="rr-more">{t('returns.line', { returns, items })}</p>
            </div>
            {(data.byMode ?? []).length > 0 ? (
              <div className="rr-smalls">
                {(data.byMode ?? []).slice(0, 3).map((m) => (
                  <Small key={m.mode} label={MODE_KEYS.has(m.mode) ? t(`mode.${m.mode as 'cash'}`) : m.mode} value={money(Number(m.refundMinor))} />
                ))}
              </div>
            ) : null}
          </section>
          <div className="rr-lists">
            <List
              title={t('returns.recent')}
              rows={recent.map((r) => ({
                key: r.id,
                name: r.items.map((i) => (i.qty > 1 ? `${i.qty} × ${i.name}` : i.name)).join(', '),
                note: day.format(new Date(r.returnedAt)),
                value: money(Number(r.refundMinor)),
              }))}
            />
          </div>
        </>
      )}
      <div className="srp-links shr-links">
        <AppLink className="btn btn-ghost" href="/orders/returns">
          {t('returns.seeAll')}
        </AppLink>
        {ships ? (
          <AppLink className="btn btn-ghost" href="/orders/refunds">
            {t('returns.online')}
          </AppLink>
        ) : null}
      </div>
    </>
  );
}
