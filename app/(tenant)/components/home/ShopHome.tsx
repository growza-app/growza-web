'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { AttendanceRegister, ShopHome as ShopHomeData } from '../../lib/api-types';
import { homeCopy } from '../../lib/home-copy';
import { canSee, canSeeRevenue, type MemberRole } from '../../lib/nav-policy';
import { ordersHref } from '../../lib/orders-filter';
import type { Lang } from '../../lib/lang';
import { useBranch } from '../BranchProvider';
import { useAreas } from '../SessionProvider';
import { IconNavClients, IconNavOrders, IconNavStock } from '../icons';
import { Card, CardError, HomeHeader, QuickTiles, rupees } from './parts';
import { CheckInCard } from './CheckInCard';

/**
 * Jira GRW-609 — a shop's Home: the money, the orders waiting to go out, and the sizes running out before the season.
 *
 * Its own Home kind, chosen by `page.tsx` BEFORE anything else is read (as NotLiveHome is), so none of the salon's
 * eight reads runs for a shop and nothing here is a conditional inside the owner's Home. One request serves the whole
 * screen (`api.shopHome`), narrowed to a branch when the owner has picked one.
 *
 * The owner and manager see the takings, today's beside yesterday's. The front desk sees none of it — and the response
 * it is sent carries none (the API omits the keys; this screen would have nothing to hide).
 *
 * Laid out at 344px: the money first (owner), then the orders, then a short running-out list, and the doors a shop uses
 * at the bottom, within a thumb's reach. No animation: this screen opens many times a day.
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
  // The branch the data on screen is for: the server's read is every branch, so a pick re-reads and a return to "all" does too.
  const loadedFor = useRef<string | null>(null);

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

  /*
   * Jira GRW-611 review — no Reports tile. Every report there is built from bookings, so `/reports` answers a shop
   * with the "not yet" sentence (Jira GRW-610) whose only two buttons are Orders and Stock — two of these tiles. A
   * door onto that is a door onto nothing; it opens when a shop has reports of its own, Jira GRW-591.
   */
  const stockBranch = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  const tiles = [
    { href: '/orders/new', label: s.takeOrder, icon: <IconNavOrders />, tone: 'green' },
    { href: '/stock', label: t.nav.stock, icon: <IconNavStock />, tone: 'blue' },
    { href: '/customers', label: t.nav.clients, icon: <IconNavClients />, tone: 'amber' },
  ].filter((l) => canSee(l.href, role, reportTabs, true, areas));

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
      <div className="page-body hm-page shp-page" aria-busy={loading || undefined}>
        {/* Jira GRW-76 — a staff-kind role holder's own "I'm in", first, as a stylist's is; the card draws only where their branch offers it. */}
        {attendanceMonth && timezone ? <CheckInCard today={attendanceMonth.rows.find((r) => r.onDate === attendanceMonth.today) ?? null} timezone={timezone} /> : null}
        {failed || !data ? (
          <Card>
            <CardError t={t} onRetry={() => load(branch)} />
          </Card>
        ) : (
          <>
            {/* Executive KPI strip across the top of the command view */}
            <div className="shp-kpi-strip">
              {money && data.today.takingsMinor !== undefined ? (
                <>
                  <div className="shp-kpi-card shp-kpi-primary">
                    <span className="shp-kpi-label">{s.todaysTakings}</span>
                    <strong className="shp-kpi-val">{rupees(data.today.takingsMinor)}</strong>
                    <span className="shp-kpi-sub">{s.orderCount(data.today.orders)} · {s.today}</span>
                  </div>
                  <div className="shp-kpi-card">
                    <span className="shp-kpi-label">{s.yesterdaysTakings}</span>
                    <strong className="shp-kpi-val shp-kpi-val-muted">{rupees(data.yesterday.takingsMinor ?? 0)}</strong>
                    <span className="shp-kpi-sub">{s.orderCount(data.yesterday.orders)} · {s.yesterday}</span>
                  </div>
                </>
              ) : (
                <div className="shp-kpi-card">
                  <span className="shp-kpi-label">{s.ordersTodayLabel}</span>
                  <strong className="shp-kpi-val">{data.today.orders}</strong>
                  <span className="shp-kpi-sub">{data.today.orders === 0 ? s.noOrdersToday : s.orderCount(data.today.orders)}</span>
                </div>
              )}
              {can('/orders') ? (
                <a
                  className={`shp-kpi-card shp-kpi-link ${data.toSend > 0 ? 'shp-kpi-warn' : ''}`}
                  href={data.toSend > 0 ? ordersHref({ status: 'new,packed' }) : '/orders'}
                >
                  <span className="shp-kpi-label">{s.waitingToSendLabel}</span>
                  <strong className="shp-kpi-val">{data.toSend}</strong>
                  <span className="shp-kpi-sub">{data.toSend > 0 ? s.needsDispatchSub : s.allSentSub}</span>
                </a>
              ) : (
                <div className={`shp-kpi-card ${data.toSend > 0 ? 'shp-kpi-warn' : ''}`}>
                  <span className="shp-kpi-label">{s.waitingToSendLabel}</span>
                  <strong className="shp-kpi-val">{data.toSend}</strong>
                  <span className="shp-kpi-sub">{data.toSend > 0 ? s.needsDispatchSub : s.allSentSub}</span>
                </div>
              )}
              {can('/stock') ? (
                <a
                  className={`shp-kpi-card shp-kpi-link ${data.running.total > 0 ? 'shp-kpi-alert' : ''}`}
                  href={`/stock${stockBranch}`}
                >
                  <span className="shp-kpi-label">{s.lowStockLabel}</span>
                  <strong className="shp-kpi-val">{data.running.counted ? data.running.total : '—'}</strong>
                  <span className="shp-kpi-sub">{data.running.counted ? s.sizesLowSub(data.running.total) : s.notCounted}</span>
                </a>
              ) : (
                <div className={`shp-kpi-card ${data.running.total > 0 ? 'shp-kpi-alert' : ''}`}>
                  <span className="shp-kpi-label">{s.lowStockLabel}</span>
                  <strong className="shp-kpi-val">{data.running.counted ? data.running.total : '—'}</strong>
                  <span className="shp-kpi-sub">{data.running.counted ? s.sizesLowSub(data.running.total) : s.notCounted}</span>
                </div>
              )}
            </div>

            <div className="shp-col-stack">
              {money && data.today.takingsMinor !== undefined ? (
                <Card
                  title={s.takings}
                  action={
                    canReports && can('/stock/channels') ? (
                      <a className="shp-link" href="/stock/channels">
                        {s.channelsLink}
                      </a>
                    ) : undefined
                  }
                >
                  <div className="shp-money">
                    <div className="shp-figure">
                      <span className="shp-figure-label">{s.today}</span>
                      <strong className="shp-figure-value">{rupees(data.today.takingsMinor)}</strong>
                      <span className="shp-figure-sub">{s.orderCount(data.today.orders)}</span>
                    </div>
                    <div className="shp-figure shp-figure-quiet">
                      <span className="shp-figure-label">{s.yesterday}</span>
                      <strong className="shp-figure-value">{rupees(data.yesterday.takingsMinor ?? 0)}</strong>
                      <span className="shp-figure-sub">{s.orderCount(data.yesterday.orders)}</span>
                    </div>
                  </div>
                  {canReports && (can('/stock/sellers') || can('/stock/report')) ? (
                    <div className="shp-inline-links">
                      {can('/stock/sellers') ? (
                        <a className="shp-pill-link" href="/stock/sellers">
                          {s.whatSellsLink}
                        </a>
                      ) : null}
                      {can('/stock/report') ? (
                        <a className="shp-pill-link" href="/stock/report">
                          {s.stockReportLink}
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </Card>
              ) : null}

              <Card title={s.ordersTitle} action={data.anyOrders && can('/orders') ? <a className="shp-link" href="/orders">{s.viewOrders}</a> : undefined}>
                {data.anyOrders ? (
                  <>
                    <div className="shp-orders-row">
                      <p className="shp-orders">
                        <strong>{data.today.orders}</strong>
                        <span>{data.today.orders === 0 ? s.noOrdersToday : s.orderCount(data.today.orders)}</span>
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
                    <span>{data.running.counted ? s.noOrdersBody : s.countFirst}</span>
                    {data.running.counted && can('/orders/new') ? (
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
          </>
        )}

        {tiles.length > 0 ? <QuickTiles items={tiles} /> : null}
      </div>
    </>
  );
}
