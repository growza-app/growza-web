'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import AppLink from '../../shared/AppLink';
import { useAreas, useMayOpen } from './SessionProvider';
import { sellsOnMarketplaces } from '../lib/order-channels';
import { SHOP_TABS, type ShopTab } from '../reports/shop-tabs';

export type RetailReportTab = 'hub' | 'profit' | 'payments' | 'discounts' | 'customers' | 'foodCost' | 'channels' | 'sellers' | 'report' | 'order' | 'returns' | 'refunds';

/**
 * Shared navigation tab bar across a retail shop's analytics and stock/order reports:
 *   - Profit, Payments, Discounts & free (`/reports/profit`, `/reports/payments`, `/reports/discounts`)
 *   - Customers (`/reports/customers`)
 *   - Where the money came from (`/stock/channels`)
 *   - What sells (`/stock/sellers`)
 *   - Stock report (`/stock/report`)
 *   - What to order (`/stock/order`)
 *   - What came back (`/orders/returns`)
 *   - What was refunded (`/orders/refunds`)
 */
export function RetailReportsNav({ active }: { active: RetailReportTab }) {
  const tReports = useTranslations('reports');
  const tMoney = useTranslations('moneyReports.tabs');
  const tChannels = useTranslations('products.channels');
  const tSellers = useTranslations('products.sellers');
  const tReport = useTranslations('products.stockReport');
  const tOrder = useTranslations('products.reorder');
  const tReturns = useTranslations('orders.returns');
  const tRefunds = useTranslations('orders.refunds');

  // A report the business does not have is not a tab: a kitchen keeps no count, so the stock report and the reorder
  // list are absent here, exactly as they are in the nav — the guard would bounce either one Home.
  // Jira GRW-754 — and a tab the person may not open is not a tab either: the same rule the screen's own guard asks
  // (role, the role's grid, the business's areas), so no chip sends anyone back Home.
  const mayOpen = useMayOpen();
  const ships = sellsOnMarketplaces(useAreas());

  const allTabs: Array<{ key: RetailReportTab; href: string; label: string }> = [
    { key: 'hub', href: '/reports', label: tReports('summaryTab') },
    // Owner, 2026-11-14 — the money questions, right after the summary: what it made, how it came in, what went out below price.
    { key: 'profit', href: '/reports/profit', label: tMoney('profit') },
    { key: 'payments', href: '/reports/payments', label: tMoney('payments') },
    { key: 'discounts', href: '/reports/discounts', label: tMoney('discounts') },
    // Owner, 2026-11-28 — who came back, who is overdue, who to message: the restaurant's Guests tab in a shop's words.
    { key: 'customers', href: '/reports/customers', label: tReports('shopCustomersTab') },
    // Jira GRW-739 — what the food cost: only where the business keeps kitchen stock (`areaAllows` drops it everywhere else).
    // Jira GRW-741 — Food cost is Inventory › Reports now; the tab here is a door to it (one screen, one address).
    { key: 'foodCost', href: '/inventory/reports', label: tMoney('foodCost') },
    { key: 'channels', href: '/stock/channels', label: tChannels('title') },
    { key: 'sellers', href: '/stock/sellers', label: tSellers('title') },
    { key: 'report', href: '/stock/report', label: tReport('title') },
    { key: 'order', href: '/stock/order', label: tOrder('title') },
    { key: 'returns', href: '/orders/returns', label: tReturns('title') },
    { key: 'refunds', href: '/orders/refunds', label: tRefunds('title') },
  ];
  // Owner, 2026-11-28 — "Online refunds" is the marketplaces' record: a shop that sells only at its counter has no such
  // tab (its refunds are on Returns), so the bar is one chip shorter for it.
  /*
   * Owner, 2026-11-28 — a shop with a counted shelf reads its Reports as six tabs (reports/ShopReports.tsx). On the full
   * screens behind them (Stock report, Reorder list, Returns, Online refunds, Top sellers) this bar is those six tabs, the
   * one this screen belongs to lit, so the way back is the same bar the owner came from.
   */
  const areas = useAreas();
  const shopTabs = areas.stock === true;
  const tShop = useTranslations('shopReports.tabs');
  const shopActive: ShopTab =
    active === 'report' || active === 'order'
      ? 'stock'
      : active === 'returns' || active === 'refunds'
        ? 'returns'
        : active === 'sellers'
          ? 'products'
          : active === 'customers'
            ? 'customers'
            : active === 'payments' || active === 'discounts'
              ? 'sales'
              : 'overview';
  const tabs = shopTabs
    ? SHOP_TABS.filter((k) => (k !== 'stock' || mayOpen('/stock/report')) && (k !== 'returns' || mayOpen('/orders/returns'))).map((k) => ({
        key: (k === shopActive ? active : k) as RetailReportTab,
        href: `/reports?view=${k}`,
        label: tShop(k),
      }))
    : allTabs.filter((tab) => mayOpen(tab.href) && (tab.key !== 'refunds' || ships));

  /*
   * Owner's review 2026-11-13 — on a phone the bar scrolls sideways, so the current tab is brought to the middle
   * on arrival: Refunds is the seventh chip and would otherwise open with its own name off the right edge. A
   * laptop's bar does not overflow, so the same arithmetic leaves it at 0.
   */
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('.is-active');
    if (!nav || !current) return;
    nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
  }, [active]);

  /*
   * Jira GRW-591 — on `/reports` none of the six IS the page (the counter report is), so `active="hub"`
   * leaves every tab in its unselected grey and the bar reads as four words in a box. The modifier gives
   * them each a border and the accent, which is what a row of links should look like.
   */
  return (
    <nav ref={navRef} className={`srp-nav ${active === 'hub' ? 'srp-nav-links' : ''}`} aria-label={tReports('title')}>
      {tabs.map((tab) => {
        const isCurrent = tab.key === active;
        return (
          <AppLink
            key={tab.key}
            href={tab.href}
            className={`srp-nav-tab ${isCurrent ? 'is-active' : ''}`}
            aria-current={isCurrent ? 'page' : undefined}
          >
            {tab.label}
          </AppLink>
        );
      })}
    </nav>
  );
}
