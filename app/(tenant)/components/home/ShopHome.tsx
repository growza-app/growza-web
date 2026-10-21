'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { ShopHome as ShopHomeData } from '../../lib/api-types';
import { homeCopy } from '../../lib/home-copy';
import { canSee, canSeeRevenue, type MemberRole } from '../../lib/nav-policy';
import type { Lang } from '../../lib/lang';
import { useBranch } from '../BranchProvider';
import { useAreas } from '../SessionProvider';
import { IconNavClients, IconNavOrders, IconNavStock } from '../icons';
import { Card, CardError, HomeHeader, QuickTiles, rupees } from './parts';

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
}) {
  const t = homeCopy(lang, labels);
  const s = t.shop;
  const areas = useAreas();
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? branchContext.choice : null;
  // The takings follow the role's Reports page for a role holder (the API sends them on the same rule), the fixed role otherwise.
  const money = areas.pages ? (areas.pages.reports ?? 'none') !== 'none' : canSeeRevenue(role);
  const can = (href: string) => canSee(href, role, reportTabs, true, areas);

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
    { href: '/products/sell', label: s.takeOrder, icon: <IconNavOrders />, tone: 'green' },
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
        {failed || !data ? (
          <Card>
            <CardError t={t} onRetry={() => load(branch)} />
          </Card>
        ) : (
          <>
            {money && data.today.takingsMinor !== undefined ? (
              <Card title={s.takings}>
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
              </Card>
            ) : null}

            <Card title={s.ordersTitle} action={data.anyOrders && can('/orders') ? <a className="shp-link" href="/orders">{s.viewOrders}</a> : undefined}>
              {data.anyOrders ? (
                <p className="shp-orders">
                  <strong>{data.today.orders}</strong>
                  <span>{data.today.orders === 0 ? s.noOrdersToday : s.orderCount(data.today.orders)}</span>
                </p>
              ) : (
                <div className="shp-empty">
                  <strong>{s.noOrdersTitle}</strong>
                  {/* A shelf nobody has counted has nothing to sell, so the first step is the count (below), not the till. */}
                  <span>{data.running.counted ? s.noOrdersBody : s.countFirst}</span>
                  {data.running.counted && can('/products/sell') ? (
                    <a className="btn btn-primary shp-cta" href="/products/sell">
                      {s.takeOrder}
                    </a>
                  ) : null}
                </div>
              )}
            </Card>

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
              )}
            </Card>
          </>
        )}

        {tiles.length > 0 ? <QuickTiles items={tiles} /> : null}
      </div>
    </>
  );
}
