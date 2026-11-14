'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, formatMoney } from '../lib/api';
import type { ReturnsReportPage, ShopHome } from '../lib/api-types';
import { useBranch } from '../components/BranchProvider';
import { useAreas } from '../components/SessionProvider';
import { sellsOnMarketplaces } from '../lib/order-channels';

/**
 * Emerald v3 (owner, 14 Nov 2026: "on orders … can we add more info?") — a row of Home's tiles over the Orders
 * list on a laptop: today's orders, today's sales, who came in, and what came back. Every figure is one Home
 * already reads (`/home/shop`, `/reports/returns`); nothing new is asked of the API.
 *
 * - A laptop's only: below 861px nothing is fetched and nothing is drawn (the phone's Orders is unchanged).
 * - Money is the API's call: `takingsMinor` is absent for a role that may not see it, and then there is no tile.
 * - Returns is a report: a role that may not read it gets a refusal, and then there is no tile.
 */
export function OrdersDeskTiles() {
  const t = useTranslations('orders.tiles');
  const tr = useTranslations('orders.returnReasons');
  const locale = useLocale();
  const areas = useAreas();
  const ships = sellsOnMarketplaces(areas);
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? branchContext.choice : null;
  const [wide, setWide] = useState(false);
  const [home, setHome] = useState<ShopHome | null>(null);
  const [returns, setReturns] = useState<ReturnsReportPage | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 861px)');
    const read = () => setWide(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);

  useEffect(() => {
    if (!wide) return;
    let live = true;
    api
      .shopHome(branch)
      .then((d) => live && setHome(d))
      .catch(() => live && setHome(null));
    api
      .returnsReport({ range: 'last_3_months', location: branch ?? undefined })
      .then((d) => live && setReturns(d))
      .catch(() => live && setReturns(null));
    return () => {
      live = false;
    };
  }, [wide, branch]);

  if (!wide || !home) return null;

  const money = (minor: number) => formatMoney(minor, 'INR', locale);
  const modes = (home.today.byPaymentMode ?? []).filter((m) => m.revenueMinor > 0);
  const topReason = returns?.byReason.reduce<ReturnsReportPage['byReason'][number] | null>((top, r) => (!top || r.returns > top.returns ? r : top), null);
  // A reason this build has no word for is shown as the data spells it.
  const reasonWord = (key: string) => {
    const k = key as Parameters<typeof tr>[0];
    return tr.has(k) ? tr(k) : key;
  };

  return (
    <div className="ord-kpis">
      <div className="ord-kpi">
        <span className="ord-kpi-label">{t('ordersToday')}</span>
        <strong className="ord-kpi-value">{home.today.orders}</strong>
        <span className="ord-kpi-note">{ships ? t('toSend', { count: home.toSend }) : t('yesterday', { count: home.yesterday.orders })}</span>
      </div>
      {home.today.takingsMinor !== undefined ? (
        <a className="ord-kpi" href="/reports">
          <span className="ord-kpi-label">{t('salesToday')}</span>
          <strong className="ord-kpi-value">{money(home.today.takingsMinor)}</strong>
          <span className="ord-kpi-note">
            {modes.length > 0 ? modes.map((m) => `${t(`modes.${m.mode}`)} ${money(m.revenueMinor)}`).join(' · ') : t('noSales')}
          </span>
        </a>
      ) : null}
      {home.customersToday !== undefined ? (
        <a className="ord-kpi" href="/customers">
          <span className="ord-kpi-label">{t('cameIn')}</span>
          <strong className="ord-kpi-value">{home.customersToday}</strong>
          <span className="ord-kpi-note">{t('cameInNote')}</span>
        </a>
      ) : null}
      {returns ? (
        <a className="ord-kpi" href="/orders/returns">
          <span className="ord-kpi-label">{t('returns')}</span>
          <strong className="ord-kpi-value">{returns.customer.returns}</strong>
          <span className="ord-kpi-note">
            {topReason && topReason.returns > 0 ? t('returnsNote', { reason: reasonWord(topReason.reason) }) : t('returnsNone')}
          </span>
        </a>
      ) : null}
    </div>
  );
}
