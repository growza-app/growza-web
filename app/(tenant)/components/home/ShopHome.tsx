'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type {
  AttendanceRegister,
  BestSellersPage,
  ByChannelPage,
  OrderListRow,
  ReturnsReportPage,
  SellersRange,
  ShopHome as ShopHomeData,
  StockReportPage,
} from '../../lib/api-types';
import { homeCopy } from '../../lib/home-copy';
import { canSee, canSeeRevenue, type MemberRole } from '../../lib/nav-policy';
import { ordersHref } from '../../lib/orders-filter';
import type { Lang } from '../../lib/lang';
import { useBranch } from '../BranchProvider';
import { useAreas } from '../SessionProvider';
import {
  IconClipboardCheck,
  IconNavClients,
  IconNavOrders,
  IconNavStock,
  IconSettings,
  IconPos,
  IconProducts,
  IconReports,
  IconUpload,
} from '../icons';
import { Avatar, Card, CardError, HomeHeader, QuickTiles, Segmented, rupees } from './parts';
import { CheckInCard } from './CheckInCard';

type ShopPeriod = 'last_7_days' | 'this_month' | 'last_3_months';

/**
 * Jira GRW-609 — a shop's Home: the money, the orders waiting to go out, and the sizes running out before the season.
 *
 * Its own Home kind, chosen by `page.tsx` BEFORE anything else is read (as NotLiveHome is), so none of the salon's
 * eight reads runs for a shop and nothing here is a conditional inside the owner's Home. One request serves the whole
 * screen (`api.shopHome`), narrowed to a branch when the owner has picked one; on laptop (`.hm-desk-v3`) the owner's
 * command center also reads the retail channel, best-seller, stock and order lists so the 4-row layout matches the
 * salon command center in density and polish.
 */
export function ShopHome({
  lang,
  labels,
  businessName,
  dateLabel,
  greetingPart,
  locationName,
  role,
  reportTabs,
  initial,
  timezone,
  attendanceMonth = null,
}: {
  lang: Lang;
  labels: Record<string, string>;
  businessName: string;
  dateLabel: string;
  greetingPart: 'morning' | 'afternoon' | 'evening';
  locationName: string | null;
  role: MemberRole | null;
  reportTabs?: string[];
  /** The whole-business read the server made; null when it failed. */
  initial: ShopHomeData | null;
  timezone?: string;
  /** Jira GRW-76 — a staff-kind role holder's own month, for the check-in card; null for everyone else. */
  attendanceMonth?: AttendanceRegister | null;
}) {
  const t = homeCopy(lang, labels);
  const s = t.shop;
  const areas = useAreas();
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? branchContext.choice : null;
  // The takings follow the role's Reports page for a role holder (the API sends them on the same rule), the fixed role otherwise.
  const money = areas.pages ? (areas.pages.reports ?? 'none') !== 'none' : canSeeRevenue(role);
  const can = (href: string) => canSee(href, role, reportTabs, true, areas);
  const canReports = role === null || role === 'owner' || role === 'manager';

  const [data, setData] = useState<ShopHomeData | null>(initial);
  const [failed, setFailed] = useState(initial === null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<ShopPeriod>('last_3_months');

  // Desktop command-center supplemental state
  const [channelData, setChannelData] = useState<ByChannelPage | null>(null);
  const [sellersData, setSellersData] = useState<BestSellersPage | null>(null);
  const [stockData, setStockData] = useState<StockReportPage | null>(null);
  const [returnsData, setReturnsData] = useState<ReturnsReportPage | null>(null);
  const [toSendRows, setToSendRows] = useState<OrderListRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderListRow[]>([]);

  // The branch the data on screen is for: the server's read is every branch, so a pick re-reads and a return to "all" does too.
  const loadedFor = useRef<string | null>(null);
  const deskReqId = useRef(0);

  const load = (location: string | null) => {
    setLoading(true);
    api
      .shopHome(location)
      .then((d) => {
        setData(d);
        setFailed(false);
        loadedFor.current = location;
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (branch === loadedFor.current) return;
    load(branch);
    // `load` only closes over setters; the branch is the one input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  // Load desktop command-center feeds whenever branch or period changes
  useEffect(() => {
    const mine = ++deskReqId.current;
    const loc = branch ?? undefined;
    const range: SellersRange = period;

    if (can('/orders')) {
      api
        .orders({ status: 'new,packed', pageSize: 5, location: branch })
        .then((res) => {
          if (mine === deskReqId.current) setToSendRows(res.rows);
        })
        .catch(() => {});
      api
        .orders({ pageSize: 6, location: branch })
        .then((res) => {
          if (mine === deskReqId.current) setRecentOrders(res.rows);
        })
        .catch(() => {});
    }

    if (money && canReports) {
      if (can('/stock/channels')) {
        api
          .byChannel({ range, location: loc })
          .then((res) => {
            if (mine === deskReqId.current) setChannelData(res);
          })
          .catch(() => {});
      }
      if (can('/stock/sellers')) {
        api
          .bestSellers({ range, location: loc, pageSize: 5 })
          .then((res) => {
            if (mine === deskReqId.current) setSellersData(res);
          })
          .catch(() => {});
      }
      if (can('/stock/report')) {
        api
          .stockReport({ location: loc, pageSize: 5 })
          .then((res) => {
            if (mine === deskReqId.current) setStockData(res);
          })
          .catch(() => {});
      }
      if (can('/orders/returns')) {
        api
          .returnsReport({ range, location: loc })
          .then((res) => {
            if (mine === deskReqId.current) setReturnsData(res);
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, period, money, canReports]);

  /*
   * Jira GRW-611 review — no Reports tile. Every report there is built from bookings, so `/reports` answers a shop
   * with the "not yet" sentence (Jira GRW-610) whose only two buttons are Orders and Stock — two of these tiles. A
   * door onto that is a door onto nothing; it opens when a shop has reports of its own, Jira GRW-591.
   */
  const stockBranch = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  /*
   * The salon's Quick links are eight tiles, four across, two rows — enough that the grid reads as a
   * pad of shortcuts rather than three icons with a gap beside them. A shop has the same screens to
   * reach; it was only ever offered three of them.
   */
  const tiles = [
    { href: '/orders/new', label: s.takeOrder, icon: <IconNavOrders />, tone: 'green' },
    { href: '/orders', label: t.nav.orders, icon: <IconNavOrders />, tone: 'blue' },
    { href: '/stock', label: t.nav.stock, icon: <IconNavStock />, tone: 'green' },
    { href: '/customers', label: t.nav.clients, icon: <IconNavClients />, tone: 'amber' },
    { href: '/attendance', label: t.nav.attendance, icon: <IconClipboardCheck />, tone: 'violet' },
    { href: '/settings', label: t.nav.settings, icon: <IconSettings />, tone: 'slate' },
  ].filter((l) => canSee(l.href, role, reportTabs, true, areas));

  const periodLabel = period === 'last_7_days' ? s.range7d : period === 'this_month' ? s.rangeMonth : s.range90d;

  const channelWord = (c: string) =>
    c === 'counter'
      ? s.counterChannel
      : c === 'flipkart'
        ? s.flipkartChannel
        : c === 'amazon'
          ? s.amazonChannel
          : c.charAt(0).toUpperCase() + c.slice(1);

  const stateWord = (status: string) =>
    status === 'done'
      ? s.stateDone
      : status === 'new'
        ? s.stateNew
        : status === 'packed'
          ? s.statePacked
          : status === 'sent'
            ? s.stateSent
            : status === 'delivered'
              ? s.stateDelivered
              : status === 'cancelled'
                ? s.stateCancelled
                : status === 'returned'
                  ? s.stateReturned
                  : status;

  const stateTone = (status: string) =>
    status === 'done' || status === 'delivered'
      ? 'green'
      : status === 'sent'
        ? 'blue'
        : status === 'new' || status === 'packed'
          ? 'amber'
          : 'rose';

  const formatShortDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
        day: 'numeric',
        month: 'short',
        ...(timezone ? { timeZone: timezone } : {}),
      }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };

  // Build SVG polyline + bar chart from channelData.trend
  const trendChart = useMemo(() => {
    const raw = channelData?.trend ?? [];
    if (raw.length === 0) return { ticks: [] as string[], points: [], polyPoints: '', maxMinor: 1 };
    const buckets = raw.slice(-7).map((b) => {
      const revenueMinor = Object.values(b.billedMinor).reduce((sum, v) => sum + Number(v || 0), 0);
      const parsed = Date.parse(`${b.startISO.slice(0, 10)}T12:00:00Z`);
      const dateShort = Number.isFinite(parsed)
        ? new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          }).format(new Date(parsed))
        : b.label;
      return { key: b.startISO, revenueMinor, dateShort };
    });
    const maxMinor = Math.max(10000, ...buckets.map((b) => b.revenueMinor));
    let peakIdx = 0;
    buckets.forEach((b, i) => {
      if (b.revenueMinor >= (buckets[peakIdx]?.revenueMinor ?? 0)) peakIdx = i;
    });
    const fmtTick = (minor: number) => {
      const r = Math.round(minor / 100);
      if (r >= 1000) return `₹${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)}k`;
      return `₹${r}`;
    };
    const ticks = [fmtTick(maxMinor), fmtTick(Math.round(maxMinor * 0.66)), fmtTick(Math.round(maxMinor * 0.33)), '₹0'];
    const n = Math.max(buckets.length, 1);
    const gapPct = 2.0;
    const colPct = (100 - gapPct * Math.max(0, n - 1)) / n;
    const points = buckets.map((d, idx) => {
      const pct = d.revenueMinor > 0 ? Math.min(94, Math.max(8, Math.round((d.revenueMinor / maxMinor) * 100))) : 4;
      const x = idx * (colPct + gapPct) + colPct / 2;
      const y = 100 - pct;
      return { ...d, pct, x, y, isPeak: idx === peakIdx && d.revenueMinor > 0 };
    });
    const polyPoints = points.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    return { ticks, points, polyPoints, maxMinor };
  }, [channelData, lang]);

  const sparkBars = useMemo(() => {
    const pts = trendChart.points.slice(-7);
    if (pts.length === 0) return [];
    const max = Math.max(1, ...pts.map((p) => p.revenueMinor));
    return pts.map((p, idx) => ({
      key: p.key,
      pct: p.revenueMinor > 0 ? Math.max(18, Math.round((p.revenueMinor / max) * 100)) : 12,
      isPeak: idx === pts.length - 1 || p.isPeak,
    }));
  }, [trendChart]);

  const channelBreakdown = useMemo(() => {
    const byKey = new Map((channelData?.channels ?? []).map((c) => [c.channel, c]));
    const totalBilled = Math.max(1, Number(channelData?.totals.billedMinor ?? 0));
    return (['counter', 'flipkart', 'amazon'] as const).map((key) => {
      const row = byKey.get(key);
      const billed = Number(row?.billedMinor ?? 0);
      const orders = row?.orders ?? 0;
      const avg = row?.averageMinor ?? null;
      const returned = row?.returnedOrders ?? 0;
      const sharePct = totalBilled > 0 && billed > 0 ? Math.max(6, Math.round((billed / totalBilled) * 100)) : 0;
      return {
        key,
        label: channelWord(key),
        billed,
        orders,
        avg,
        returned,
        sharePct,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelData, lang]);

  const topSeller = sellersData?.rows?.[0] ?? null;
  const totalReturnedOrders =
    (returnsData ? returnsData.customer.returns + returnsData.undelivered.returns : null) ??
    channelData?.totals.returnedOrders ??
    0;

  const outOfStockCount = stockData
    ? stockData.styles.reduce((acc, st) => acc + st.sizes.filter((sz) => sz.stock <= 0).length, 0)
    : (data?.running.items ?? []).filter((i) => i.left <= 0).length;
  const lowOnlyCount = Math.max(0, (data?.running.total ?? 0) - outOfStockCount);

  return (
    <>
      <HomeHeader
        t={t}
        title={t.greeting(greetingPart)}
        sub={money ? t.ownerSub(businessName, false) : businessName}
        businessName={businessName}
        locationName={locationName}
        dateLabel={dateLabel}
      />
      <div className="page-body hm-page hm-fit shp-page" aria-busy={loading || undefined}>
        {/* Jira GRW-76 — a staff-kind role holder's own "I'm in", first, as a stylist's is; the card draws only where their branch offers it. */}
        {attendanceMonth && timezone ? <CheckInCard today={attendanceMonth.rows.find((r) => r.onDate === attendanceMonth.today) ?? null} timezone={timezone} /> : null}
        {failed || !data ? (
          <Card>
            <CardError t={t} onRetry={() => load(branch)} />
          </Card>
        ) : (
          <>
            {/* Top Toolbar (Desktop Command Center period switch & quick primary actions) */}
            <div className="hm-toolbar shp-desk-toolbar">
              {money && canReports ? (
                <Segmented
                  label={s.rangeLabel}
                  value={period}
                  options={[
                    { value: 'last_7_days', label: s.range7d },
                    { value: 'this_month', label: s.rangeMonth },
                    { value: 'last_3_months', label: s.range90d },
                  ]}
                  onChange={(v) => setPeriod(v)}
                />
              ) : <div />}
              <div className="hm-toolbar-end">
                <div className="hm-primary-actions hm-toolbar-actions hm-desktop">
                  {can('/orders/import') ? (
                    <a href="/orders/import" className="hm-action">
                      <IconUpload />
                      <strong>{s.importOrders}</strong>
                    </a>
                  ) : null}
                  {can('/orders/new') ? (
                    <a href="/orders/new" className="hm-action hm-action-dark">
                      <IconPos />
                      <strong>{s.takeOrder}</strong>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>

            {/* =====================================================================
                DESKTOP COMMAND CENTER (4-row Salon-style layout from 861px up)
               ===================================================================== */}
            <div className="hm-desk-v3 hm-desktop shp-desk-v3">
              {/* ROW 1 — four rich KPI cards; three where there is no shelf (a kitchen), which drops Stock worth. */}
              <div className={`hm-v3-kpis${areas.stock ? '' : ' hm-v3-kpis-3'}`}>
                {/* 1. Takings / Billed Revenue */}
                {money && data.today.takingsMinor !== undefined ? (
                  <section className="hm-v3-kpi hm-v3-kpi-dark">
                    <div className="hm-v3-kpi-head">
                      <span className="hm-v3-kpi-icon hm-v3-icon-dark" aria-hidden>
                        <span className="hm-v3-rupee-glyph">₹</span>
                      </span>
                      {canReports && can('/stock/channels') ? (
                        <a className="hm-v3-kpi-title hm-v3-kpi-title-link" href="/stock/channels">
                          {s.takings}
                        </a>
                      ) : (
                        <span className="hm-v3-kpi-title">{s.todaysTakings}</span>
                      )}
                      {canReports ? (
                        <button
                          type="button"
                          className="hm-v3-kpi-period"
                          onClick={() => {
                            const next: ShopPeriod =
                              period === 'last_7_days'
                                ? 'this_month'
                                : period === 'this_month'
                                  ? 'last_3_months'
                                  : 'last_7_days';
                            setPeriod(next);
                          }}
                          aria-label={s.rangeLabel}
                        >
                          {periodLabel} ▾
                        </button>
                      ) : null}
                    </div>
                    <div className="hm-v3-kpi-body">
                      <div className="hm-v3-kpi-main">
                        <div className="hm-v3-kpi-num-row">
                          <strong className="hm-v3-kpi-amount">
                            {rupees(
                              channelData
                                ? Number(channelData.totals.billedMinor)
                                : data.today.takingsMinor,
                            )}
                          </strong>
                        </div>
                        <div className="hm-v3-kpi-delta-row">
                          {channelData?.totals.changePct !== null && channelData?.totals.changePct !== undefined ? (
                            <span className="hm-v3-delta-pill">
                              {channelData.totals.changePct >= 0 ? '↑' : '↓'} {Math.abs(channelData.totals.changePct)}%
                            </span>
                          ) : null}
                          <span className="hm-v3-kpi-vs">
                            {s.today} {rupees(data.today.takingsMinor)} · {s.yesterday} {rupees(data.yesterday.takingsMinor ?? 0)}
                          </span>
                        </div>
                      </div>
                      {sparkBars.length > 0 ? (
                        <div className="hm-v3-mini-bars" aria-hidden>
                          {sparkBars.map((b) => (
                            <span
                              key={b.key}
                              className={b.isPeak ? 'is-peak' : ''}
                              style={{ height: `${b.pct}%` }}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="hm-v3-kpi-foot hm-v3-split-foot">
                      {channelBreakdown.map((ch) => (
                        <span key={ch.key} className="hm-v3-split-item">
                          {ch.label} <b>{rupees(ch.billed)}</b>
                        </span>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="hm-v3-kpi hm-v3-kpi-dark">
                    <div className="hm-v3-kpi-head">
                      <span className="hm-v3-kpi-icon hm-v3-icon-dark" aria-hidden>
                        <IconNavOrders />
                      </span>
                      <span className="hm-v3-kpi-title">{s.ordersTodayLabel}</span>
                    </div>
                    <div className="hm-v3-kpi-body">
                      <div className="hm-v3-kpi-main">
                        <div className="hm-v3-kpi-num-row">
                          <strong className="hm-v3-kpi-amount">{data.today.orders}</strong>
                        </div>
                        <div className="hm-v3-kpi-delta-row">
                          <span className="hm-v3-kpi-vs">
                            {data.today.orders === 0 ? s.noOrdersToday : s.orderCount(data.today.orders)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="hm-v3-kpi-foot hm-v3-split-foot">
                      <span className="hm-v3-split-item">
                        {s.toSendShort} <b>{data.toSend}</b>
                      </span>
                    </div>
                  </section>
                )}

                {/* 2. Orders & Dispatch */}
                <a
                  className="hm-v3-kpi hm-v3-kpi-link hm-v3-kpi-blue"
                  href={data.toSend > 0 ? ordersHref({ status: 'new,packed' }) : '/orders'}
                >
                  <div className="hm-v3-kpi-head">
                    <span className="hm-v3-kpi-icon hm-v3-icon-blue">
                      <IconNavOrders />
                    </span>
                    <span className="hm-v3-kpi-title">{s.ordersTitle}</span>
                  </div>
                  <div className="hm-v3-kpi-body">
                    <div className="hm-v3-kpi-main">
                      <div className="hm-v3-kpi-num-row">
                        <strong className="hm-v3-kpi-value">
                          {channelData ? channelData.totals.orders : data.today.orders}
                        </strong>
                      </div>
                      <div className="hm-v3-kpi-delta-row">
                        <span className="hm-v3-kpi-sub">
                          {data.toSend > 0 ? `${s.toSend(data.toSend)} · ${s.needsDispatchSub}` : s.allSentSub}
                        </span>
                      </div>
                    </div>
                    {sparkBars.length > 0 ? (
                      <div className="hm-v3-mini-bars is-blue" aria-hidden>
                        {sparkBars.map((b) => (
                          <span
                            key={b.key}
                            className={b.isPeak ? 'is-peak' : ''}
                            style={{ height: `${b.pct}%` }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="hm-v3-prog-track" aria-hidden>
                    {(() => {
                      const tot = Math.max(1, (channelData?.totals.orders ?? data.today.orders) + data.toSend);
                      const sentShare = Math.max(10, Math.round(((tot - data.toSend - totalReturnedOrders) / tot) * 100));
                      const waitShare = Math.round((data.toSend / tot) * 100);
                      const retShare = Math.round((totalReturnedOrders / tot) * 100);
                      return (
                        <>
                          <span className="is-deep" style={{ width: `${sentShare}%` }} />
                          <span className="is-amber" style={{ width: `${waitShare}%` }} />
                          <span className="is-green" style={{ width: `${retShare}%` }} />
                        </>
                      );
                    })()}
                  </div>
                  <div className="hm-v3-kpi-foot hm-v3-split-foot">
                    <span className="hm-v3-split-item">
                      {s.today} <b>{data.today.orders}</b>
                    </span>
                    <span className="hm-v3-split-item">
                      {s.toSendShort} <b>{data.toSend}</b>
                    </span>
                    <span className="hm-v3-split-item">
                      {s.returnedShort} <b>{totalReturnedOrders}</b>
                    </span>
                  </div>
                </a>

                {/* 3. Units Sold & Top Seller */}
                <a
                  className="hm-v3-kpi hm-v3-kpi-link hm-v3-kpi-amber"
                  href={canReports && can('/stock/sellers') ? '/stock/sellers' : '/orders'}
                >
                  <div className="hm-v3-kpi-head">
                    <span className="hm-v3-kpi-icon hm-v3-icon-amber">
                      <IconProducts />
                    </span>
                    <span className="hm-v3-kpi-title">{s.unitsSoldTitle}</span>
                  </div>
                  <div className="hm-v3-kpi-body">
                    <div className="hm-v3-kpi-main">
                      <div className="hm-v3-kpi-num-row">
                        <strong className="hm-v3-kpi-value">{sellersData ? sellersData.totals.units : data.today.orders}</strong>
                      </div>
                      <div className="hm-v3-kpi-delta-row">
                        <span className="hm-v3-kpi-sub">
                          {sellersData
                            ? s.acrossSizes(rupees(Number(sellersData.totals.valueMinor)), sellersData.totals.sizes)
                            : periodLabel}
                        </span>
                      </div>
                    </div>
                    {sparkBars.length > 0 ? (
                      <div className="hm-v3-mini-bars is-amber" aria-hidden>
                        {sparkBars.map((b) => (
                          <span
                            key={b.key}
                            className={b.isPeak ? 'is-peak' : ''}
                            style={{ height: `${b.pct}%` }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="hm-v3-kpi-foot hm-v3-prod-foot">
                    <span className="hm-v3-prod-inline">
                      <span>{s.topSellerLabel}</span>{' '}
                      <b>
                        {topSeller
                          ? `${topSeller.name}${topSeller.sizeLabel ? ` (${topSeller.sizeLabel})` : ''} · ${topSeller.units}`
                          : '—'}
                      </b>
                    </span>
                  </div>
                </a>

                {/* 4. Stock Worth & Shelf Health — a count, so a kitchen has none of it. */}
                {!areas.stock ? null : (
                <a
                  className="hm-v3-kpi hm-v3-kpi-link hm-v3-kpi-purple"
                  href={canReports && can('/stock/report') ? '/stock/report' : `/stock${stockBranch}`}
                >
                  <div className="hm-v3-kpi-head">
                    <span className="hm-v3-kpi-icon hm-v3-icon-green">
                      <IconNavStock />
                    </span>
                    <span className="hm-v3-kpi-title">{s.stockWorthTitle}</span>
                  </div>
                  <div className="hm-v3-kpi-body">
                    <div className="hm-v3-kpi-main">
                      <div className="hm-v3-kpi-num-row">
                        <strong className="hm-v3-kpi-value">
                          {stockData
                            ? rupees(Number(stockData.totals.valueMinor))
                            : data.running.counted
                              ? data.running.total
                              : '—'}
                        </strong>
                      </div>
                      <div className="hm-v3-kpi-delta-row">
                        <span className="hm-v3-kpi-sub">
                          {stockData
                            ? s.stylesAndSizes(stockData.totals.styles, stockData.totals.sizes)
                            : data.running.counted
                              ? s.sizesLowSub(data.running.total)
                              : s.notCounted}
                        </span>
                      </div>
                    </div>
                    {sparkBars.length > 0 ? (
                      <div className="hm-v3-mini-bars is-purple" aria-hidden>
                        {sparkBars.map((b) => (
                          <span
                            key={b.key}
                            className={b.isPeak ? 'is-peak' : ''}
                            style={{ height: `${b.pct}%` }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="hm-v3-kpi-foot hm-v3-split-foot">
                    <span className="hm-v3-split-item">
                      {s.onShelfShort} <b>{stockData ? stockData.totals.units : '—'}</b>
                    </span>
                    <span className="hm-v3-split-item">
                      {s.lowStockShort} <b>{data.running.counted ? data.running.total : '—'}</b>
                    </span>
                  </div>
                </a>
                )}
              </div>

              {/* ROW 2 — Sales Trend Chart + Where Money Came From + Quick Actions */}
              <div className={`hm-v3-mid${money && canReports ? '' : ' hm-v3-mid-two'}`}>
                {/* 1. Sales Trend SVG Line + Bar Chart */}
                <section className="hm-v3-card hm-v3-trend-card">
                  <div className="hm-v3-card-head">
                    <h2>{s.salesTrendTitle}</h2>
                    <span className="hm-v3-period-pill is-static">{periodLabel}</span>
                  </div>
                  {trendChart.points.length === 0 ? (
                    <p className="hm-empty">{s.noSalesInRange}</p>
                  ) : (
                    <div className="hm-v3-chart-box">
                      <div className="hm-v3-yaxis" aria-hidden>
                        {trendChart.ticks.map((lbl, idx) => (
                          <span key={idx}>{lbl}</span>
                        ))}
                      </div>
                      <div className="hm-v3-chart-plot">
                        <div className="hm-v3-grid-lines" aria-hidden>
                          <span />
                          <span />
                          <span />
                          <span />
                        </div>
                        <svg className="hm-v3-trend-line-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                          <polyline className="hm-v3-trend-poly" points={trendChart.polyPoints} vectorEffect="non-scaling-stroke" />
                        </svg>
                        <div
                          className="hm-v3-bars"
                          style={{ gridTemplateColumns: `repeat(${trendChart.points.length}, minmax(0, 1fr))` }}
                        >
                          {trendChart.points.map((d) => (
                            <div key={d.key} className={`hm-v3-bar-col ${d.isPeak ? 'is-peak' : ''}`}>
                              <div className="hm-v3-bar-track">
                                {d.isPeak ? (
                                  <span className="hm-v3-bar-tip" style={{ bottom: `calc(${d.pct}% + 10px)` }}>
                                    {rupees(d.revenueMinor)}
                                  </span>
                                ) : null}
                                <span className="hm-v3-bar-dot" style={{ bottom: `calc(${d.pct}% - 4px)` }} aria-hidden />
                                <span className="hm-v3-bar-fill" style={{ height: `${d.pct}%` }} />
                              </div>
                              <span className="hm-v3-bar-day">{d.dateShort}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {/* 2. Where Money Came From (Counter · Flipkart · Amazon) */}
                {money && canReports ? (
                  <section className="hm-v3-card shp-channels-card">
                    <div className="hm-v3-card-head">
                      <h2>{s.channelsLink}</h2>
                      {can('/stock/channels') ? (
                        <a className="hm-v3-head-link" href="/stock/channels">
                          {s.viewOrders} →
                        </a>
                      ) : null}
                    </div>
                    <ul className="hm-v3-srv-rows shp-channel-rows">
                      {channelBreakdown.map((ch) => (
                        <li key={ch.key} className="shp-channel-row">
                          <div className="shp-channel-row-top">
                            <span className={`ord-chan-badge ord-chan-${ch.key}`}>{ch.label}</span>
                            <span className="shp-channel-meta">
                              { s.orderCount(ch.orders) }
                              { ch.avg !== null ? ` · ${s.avgOrderShort(rupees(Math.round(ch.avg / 100) * 100))}` : '' }
                            </span>
                            <strong className="hm-v3-srv-rev">{rupees(ch.billed)}</strong>
                          </div>
                          <div className="hm-v3-srv-bar">
                            <span style={{ width: `${ch.sharePct}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {/* 3. Quick Actions (2x3 Grid) */}
                <section className="hm-v3-card hm-v3-quick-card">
                  <div className="hm-v3-card-head">
                    <h2>{s.quickActionsTitle}</h2>
                  </div>
                  <div className="hm-v3-qgrid">
                    {can('/orders/new') ? (
                      <a className="hm-v3-qbtn is-primary" href="/orders/new">
                        <span className="hm-v3-qicon">
                          <IconPos />
                        </span>
                        <strong>{s.takeOrder}</strong>
                      </a>
                    ) : null}
                    {can('/orders') ? (
                      <a className="hm-v3-qbtn is-green" href="/orders">
                        <span className="hm-v3-qicon">
                          <IconNavOrders />
                        </span>
                        <strong>{s.ordersTitle}</strong>
                      </a>
                    ) : null}
                    {can('/stock') ? (
                      <a className="hm-v3-qbtn is-amber" href={`/stock${stockBranch}`}>
                        <span className="hm-v3-qicon">
                          <IconNavStock />
                        </span>
                        <strong>{t.nav.stock}</strong>
                      </a>
                    ) : null}
                    {can('/orders/import') ? (
                      <a className="hm-v3-qbtn is-mint" href="/orders/import">
                        <span className="hm-v3-qicon">
                          <IconUpload />
                        </span>
                        <strong>{s.importOrders}</strong>
                      </a>
                    ) : null}
                    {can('/customers') ? (
                      <a className="hm-v3-qbtn is-purple" href="/customers?add=1">
                        <span className="hm-v3-qicon">
                          <IconNavClients />
                        </span>
                        <strong>{s.addCustomerAction}</strong>
                      </a>
                    ) : null}
                    {canReports && can('/stock/order') ? (
                      <a className="hm-v3-qbtn is-blue" href="/stock/order">
                        <span className="hm-v3-qicon">
                          <IconReports />
                        </span>
                        <strong>{s.whatToOrderLink}</strong>
                      </a>
                    ) : null}
                  </div>
                </section>
              </div>

              {/* ROW 3 — three attention cards; two where there is no shelf (a kitchen), which drops the stock one. */}
              <div className={`hm-v3-bot${areas.stock ? '' : ' hm-v3-bot-2'}`}>
                {/* 1. Orders needing attention */}
                <section className="hm-v3-card hm-v3-services-card hm-v3-desk-attention shp-orders-att">
                  <div className="hm-v3-card-head">
                    <h2>
                      {s.ordersAttentionTitle}{' '}
                      <span className="hm-v3-count">({data.toSend + totalReturnedOrders})</span>
                    </h2>
                    {can('/orders') ? (
                      <a className="hm-v3-head-link" href={ordersHref({ status: 'new,packed' })}>
                        {s.viewOrders} →
                      </a>
                    ) : null}
                  </div>
                  <div className="hm-v3-prod-att-summary shp-two-chips">
                      {can('/orders') ? (
                        <a
                          className={`hm-v3-prod-att-chip is-amber ${data.toSend === 0 ? 'is-clear' : ''}`}
                          href={ordersHref({ status: 'new,packed' })}
                        >
                          <strong>{data.toSend}</strong>
                          <span>{s.waitingToSendLabel}</span>
                        </a>
                      ) : (
                        <span className={`hm-v3-prod-att-chip is-amber ${data.toSend === 0 ? 'is-clear' : ''}`}>
                          <strong>{data.toSend}</strong>
                          <span>{s.waitingToSendLabel}</span>
                        </span>
                      )}
                      {canReports && can('/orders/returns') ? (
                        <a
                          className={`hm-v3-prod-att-chip is-rose ${totalReturnedOrders === 0 ? 'is-clear' : ''}`}
                          href="/orders/returns"
                        >
                          <strong>{totalReturnedOrders}</strong>
                          <span>{s.cameBackLabel}</span>
                        </a>
                      ) : can('/orders') ? (
                        <a
                          className={`hm-v3-prod-att-chip is-rose ${totalReturnedOrders === 0 ? 'is-clear' : ''}`}
                          href={ordersHref({ status: 'returned' })}
                        >
                          <strong>{totalReturnedOrders}</strong>
                          <span>{s.cameBackLabel}</span>
                        </a>
                      ) : null}
                  </div>
                  {toSendRows.length === 0 ? (
                    <p className="hm-empty">{s.allOrdersDispatched}</p>
                  ) : (
                    <ul className="hm-v3-srv-rows hm-v3-prod-att-rows">
                      {toSendRows.map((o) => {
                        const customerName = o.who?.name?.trim() || s.noNameCustomer;
                        return (
                          <li key={o.id}>
                            <a className="hm-v3-srv-row hm-v3-prod-att-row" href={`/orders/${o.id}`}>
                              <Avatar name={customerName} id={o.id} size={30} />
                              <div className="hm-v3-srv-main">
                                <strong className="hm-v3-srv-name">{customerName}</strong>
                                <span className="hm-v3-prod-att-sub">
                                  #{o.code.toUpperCase()} · {channelWord(o.channel)} · {s.itemCountShort(o.items)}
                                </span>
                              </div>
                              <span className={`hm-pill hm-pill-${stateTone(o.status)}`}>{stateWord(o.status)}</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {/* 2. Stock needing attention — a count, so a kitchen has none of it. */}
                {!areas.stock ? null : (
                <section className="hm-v3-card hm-v3-products-card hm-v3-prod-attention">
                  <div className="hm-v3-card-head">
                    <h2>
                      {s.stockAttentionTitle}{' '}
                      <span className="hm-v3-count">({data.running.counted ? data.running.total : 0})</span>
                    </h2>
                    {can('/stock') ? (
                      <a className="hm-v3-head-link" href={`/stock${stockBranch}`}>
                        {s.viewOrders} →
                      </a>
                    ) : null}
                  </div>
                  <div className="hm-v3-prod-att-summary">
                    {can('/stock') ? (
                      <>
                        <a
                          className={`hm-v3-prod-att-chip is-rose ${outOfStockCount === 0 ? 'is-clear' : ''}`}
                          href={`/stock${stockBranch}`}
                        >
                          <strong>{outOfStockCount}</strong>
                          <span>{s.outOfStockChip}</span>
                        </a>
                        <a
                          className={`hm-v3-prod-att-chip is-amber ${lowOnlyCount === 0 ? 'is-clear' : ''}`}
                          href={`/stock${stockBranch}`}
                        >
                          <strong>{lowOnlyCount}</strong>
                          <span>{s.runningLowChip}</span>
                        </a>
                      </>
                    ) : (
                      <>
                        <span className={`hm-v3-prod-att-chip is-rose ${outOfStockCount === 0 ? 'is-clear' : ''}`}>
                          <strong>{outOfStockCount}</strong>
                          <span>{s.outOfStockChip}</span>
                        </span>
                        <span className={`hm-v3-prod-att-chip is-amber ${lowOnlyCount === 0 ? 'is-clear' : ''}`}>
                          <strong>{lowOnlyCount}</strong>
                          <span>{s.runningLowChip}</span>
                        </span>
                      </>
                    )}
                  </div>
                  {!data.running.counted ? (
                    <p className="hm-empty">{s.notCounted}</p>
                  ) : data.running.items.length === 0 ? (
                    <p className="hm-empty">{s.nothingLow}</p>
                  ) : (
                    <ul className="hm-v3-srv-rows hm-v3-prod-att-rows">
                      {data.running.items.slice(0, 5).map((r) => {
                        const isOut = r.left <= 0;
                        return (
                          <li key={`${r.productId}-${r.size ?? ''}`}>
                            <a className="hm-v3-srv-row hm-v3-prod-att-row" href={`/stock${stockBranch}`}>
                              <Avatar name={r.name} id={r.productId} size={30} />
                              <div className="hm-v3-srv-main">
                                <strong className="hm-v3-srv-name">{r.name}</strong>
                                <span className="hm-v3-prod-att-sub">
                                  {r.size ? s.sizeWord(r.size) : t.nav.stock}
                                </span>
                              </div>
                              <span className={`hm-pill hm-pill-${isOut ? 'rose' : 'amber'}`}>{s.left(r.left)}</span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
                )}

                {/* 3. What sells (Top selling sizes) */}
                <section className="hm-v3-card hm-v3-staff-card">
                  <div className="hm-v3-card-head">
                    <h2>
                      {s.whatSellsLink}{' '}
                      {sellersData ? <span className="hm-v3-count">({sellersData.totals.sizes})</span> : null}
                    </h2>
                    {canReports && can('/stock/sellers') ? (
                      <a className="hm-v3-head-link" href="/stock/sellers">
                        {s.viewOrders} →
                      </a>
                    ) : null}
                  </div>
                  {!sellersData || sellersData.rows.length === 0 ? (
                    <p className="hm-empty">{s.noSalesInRange}</p>
                  ) : (
                    <ul className="hm-v3-srv-rows hm-v3-prod-att-rows">
                      {sellersData.rows.slice(0, 5).map((item) => (
                        <li key={item.id}>
                          <a
                            className="hm-v3-srv-row hm-v3-prod-att-row"
                            href={canReports && can('/stock/sellers') ? '/stock/sellers' : `/stock${stockBranch}`}
                          >
                            <Avatar name={item.name} id={item.productId} size={30} />
                            <div className="hm-v3-srv-main">
                              <strong className="hm-v3-srv-name">
                                {item.name}
                                {item.sizeLabel ? ` (${item.sizeLabel})` : ''}
                              </strong>
                              <span className="hm-v3-prod-att-sub">{rupees(Number(item.valueMinor))}</span>
                            </div>
                            <span className="hm-pill hm-pill-green">{s.soldCountPill(item.units)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* ROW 4 — Recent Orders (Full-Width Table Card) */}
              <section className="hm-v3-card hm-v3-recent-card">
                <div className="hm-v3-card-head">
                  <h2>
                    {s.recentOrdersTitle}{' '}
                    <span className="hm-v3-count">({recentOrders.length})</span>
                  </h2>
                  {can('/orders') ? (
                    <a className="hm-v3-head-link" href="/orders">
                      {s.viewOrders} →
                    </a>
                  ) : null}
                </div>
                {recentOrders.length === 0 ? (
                  <p className="hm-empty">{s.noOrdersBody}</p>
                ) : (
                  <div className="hm-v3-recent-wrap">
                    <table className="hm-v3-recent-table">
                      <thead>
                        <tr>
                          <th>{s.colWhen}</th>
                          <th>{s.colCustomer}</th>
                          <th>{s.colChannel}</th>
                          <th>{s.colItems}</th>
                          {money ? <th>{s.colAmount}</th> : null}
                          <th>{s.colStatus}</th>
                          <th>{s.colActions}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentOrders.map((o) => {
                          const customerName = o.who?.name?.trim() || s.noNameCustomer;
                          return (
                            <tr key={o.id}>
                              <td className="hm-v3-td-time">
                                <strong>{formatShortDate(o.soldAt)}</strong>
                              </td>
                              <td className="hm-v3-td-client">
                                <div className="hm-v3-person">
                                  <Avatar name={customerName} id={o.id} size={28} />
                                  <div className="hm-v3-person-meta">
                                    <strong>{customerName}</strong>
                                    <span>#{o.code.toUpperCase()}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className={`ord-chan-badge ord-chan-${o.channel}`}>
                                  {channelWord(o.channel)}
                                </span>
                              </td>
                              <td>{s.itemCountShort(o.items)}</td>
                              {money ? (
                                <td className="hm-v3-td-amount">
                                  <strong>{o.amountMinor !== undefined ? rupees(o.amountMinor) : '—'}</strong>
                                </td>
                              ) : null}
                              <td>
                                <span className={`hm-pill hm-pill-${stateTone(o.status)}`}>
                                  {stateWord(o.status)}
                                </span>
                              </td>
                              <td>
                                <a className="hm-v3-row-btn" href={`/orders/${o.id}`}>
                                  {s.openOrderAction}
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            {/* =====================================================================
                MOBILE STACK (<861px — preserves every source pin & 344px ergonomics)
               ===================================================================== */}
            <div className="shp-mobile-stack">
              <div className="shp-col-stack">
                {/*
                  The money, as the salon's Home states it: one dark hero that anchors the screen,
                  not a white card the same weight as every other. Written with the salon's own class
                  names (`hm-hero`, `hm-hero-amount`, `hm-hero-stats`, `hm-line-foot`) so it inherits
                  that skin exactly rather than a second one drifting beside it — a shop's figures are
                  different from a salon's, the way they are shown should not be.
                */}
                {money && data.today.takingsMinor !== undefined ? (
                  <section className="hm-hero shp-hero">
                    <div className="hm-hero-top">
                      <span className="hm-eyebrow">{s.takings}</span>
                      {canReports && can('/stock/channels') ? (
                        <a className="shp-hero-link" href="/stock/channels">
                          {s.channelsLink}
                        </a>
                      ) : null}
                    </div>
                    <div className="hm-hero-amount">{rupees(data.today.takingsMinor)}</div>
                    <div className="hm-hero-stats">
                      <span>
                        <strong>{data.today.orders}</strong> {s.orderWord(data.today.orders)}
                      </span>
                      <span>
                        {s.yesterday} <strong>{rupees(data.yesterday.takingsMinor ?? 0)}</strong>
                      </span>
                    </div>
                    {canReports && (can('/stock/sellers') || can('/stock/report')) ? (
                      <div className="shp-hero-links">
                        {can('/stock/sellers') ? (
                          <a className="shp-hero-pill" href="/stock/sellers">
                            {s.whatSellsLink}
                          </a>
                        ) : null}
                        {can('/stock/report') ? (
                          <a className="shp-hero-pill" href="/stock/report">
                            {s.stockReportLink}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <Card title={s.ordersTitle} action={data.anyOrders && can('/orders') ? <a className="shp-link" href="/orders">{s.viewOrders}</a> : undefined}>
                  {data.anyOrders ? (
                    <>
                      <div className="shp-orders-row">
                        {/* The big number says how many; "3 orders" beside a 3 said it twice. Today is what it counts. */}
                        <p className="shp-orders">
                          <strong>{data.today.orders}</strong>
                          <span>{data.today.orders === 0 ? s.noOrdersToday : s.today}</span>
                        </p>
                        {can('/orders/new') ? (
                          <a className="btn shp-cta" href="/orders/new">
                            {s.takeOrder}
                          </a>
                        ) : null}
                      </div>
                      {/*
                        Jira GRW-614 (FR-06) — the work waiting. It opens the Orders list already filtered to exactly the states
                        this count is of (`new,packed`), so the number on Home and the rows behind it cannot disagree. Absent
                        when nothing is waiting: a "0 to send" is a line of noise on the screen opened most often.
                      */}
                      {data.toSend > 0 ? (
                        <a className="shp-link shp-tosend" href={ordersHref({ status: 'new,packed' })}>
                          {s.toSend(data.toSend)}
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <div className="shp-empty">
                      <strong>{s.noOrdersTitle}</strong>
                      {/* A shelf nobody has counted has nothing to sell, so the first step is the count (below), not the till. */}
                      {/* A shelf nobody counted cannot sell; a kitchen has no shelf, so its first step IS the till. */}
                      <span>{data.running.counted || !areas.stock ? s.noOrdersBody : s.countFirst}</span>
                      {(data.running.counted || !areas.stock) && can('/orders/new') ? (
                        <a className="btn btn-primary shp-cta" href="/orders/new">
                          {s.takeOrder}
                        </a>
                      ) : null}
                    </div>
                  )}
                </Card>
              </div>

              {/*
                Jira GRW-611 review — "View all" opens the SHELF, not its `low` filter. That filter answers the Stock
                screen's question per style (a sized style's count is the sum of its sizes) and this list is per size,
                so the filter could hold none of the rows just listed: a uniform with ten sizes at one each counts as
                twenty in stock. The shelf holds every one of them. A per-size low filter is Jira GRW-591's.
              */}
              {/* Running out — a count, and a kitchen has none. */}
              {!areas.stock ? null : (
              <Card title={s.runningOut} action={data.running.total > data.running.items.length && can('/stock') ? <a className="shp-link" href={`/stock${stockBranch}`}>{s.viewAll(data.running.total)}</a> : undefined}>
                {!data.running.counted ? (
                  <div className="shp-empty">
                    <span>{s.notCounted}</span>
                    {can('/stock') ? (
                      <a className="btn shp-cta" href="/stock">
                        {s.countStock}
                      </a>
                    ) : null}
                  </div>
                ) : data.running.items.length === 0 ? (
                  <p className="shp-plain">{s.nothingLow}</p>
                ) : (
                  <>
                    <ul className="shp-running">
                      {data.running.items.map((r) => (
                        <li key={`${r.productId}-${r.size ?? ''}`}>
                          <span className="shp-running-name">
                            {r.name}
                            {r.size ? <span className="shp-running-size"> · {s.sizeWord(r.size)}</span> : null}
                          </span>
                          <span className={`shp-running-left ${r.left <= 0 ? 'is-out' : ''}`}>{s.left(r.left)}</span>
                        </li>
                      ))}
                    </ul>
                    {canReports && can('/stock/order') ? (
                      <div className="shp-running-foot">
                        <a className="shp-pill-link" href="/stock/order">
                          {s.whatToOrderLink}
                        </a>
                      </div>
                    ) : null}
                  </>
                )}
              </Card>
              )}
            </div>
          </>
        )}


        {tiles.length > 0 ? (
          <Card className="hm-area-links hm-mobile shp-links" title={t.quickLinks}>
            <QuickTiles items={tiles} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
