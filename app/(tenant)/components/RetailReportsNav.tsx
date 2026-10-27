'use client';

import { useTranslations } from 'next-intl';
import AppLink from '../../shared/AppLink';
import { areaAllows } from '../lib/areas';
import { useAreas } from './SessionProvider';

export type RetailReportTab = 'hub' | 'channels' | 'sellers' | 'report' | 'order' | 'returns' | 'refunds';

/**
 * Shared navigation tab bar across a retail shop's analytics and stock/order reports:
 *   - Where the money came from (`/stock/channels`)
 *   - What sells (`/stock/sellers`)
 *   - Stock report (`/stock/report`)
 *   - What to order (`/stock/order`)
 *   - What came back (`/orders/returns`)
 *   - What was refunded (`/orders/refunds`)
 */
export function RetailReportsNav({ active }: { active: RetailReportTab }) {
  const tChannels = useTranslations('products.channels');
  const tSellers = useTranslations('products.sellers');
  const tReport = useTranslations('products.stockReport');
  const tOrder = useTranslations('products.reorder');
  const tReturns = useTranslations('orders.returns');
  const tRefunds = useTranslations('orders.refunds');

  // A report the business does not have is not a tab: a kitchen keeps no count, so the stock report and the reorder
  // list are absent here, exactly as they are in the nav — the guard would bounce either one Home.
  const areas = useAreas();
  const allTabs: Array<{ key: RetailReportTab; href: string; label: string }> = [
    { key: 'channels', href: '/stock/channels', label: tChannels('title') },
    { key: 'sellers', href: '/stock/sellers', label: tSellers('title') },
    { key: 'report', href: '/stock/report', label: tReport('title') },
    { key: 'order', href: '/stock/order', label: tOrder('title') },
    { key: 'returns', href: '/orders/returns', label: tReturns('title') },
    { key: 'refunds', href: '/orders/refunds', label: tRefunds('title') },
  ];
  const tabs = allTabs.filter((tab) => areaAllows(tab.href, areas));

  /*
   * Jira GRW-591 — on `/reports` none of the six IS the page (the counter report is), so `active="hub"`
   * leaves every tab in its unselected grey and the bar reads as four words in a box. The modifier gives
   * them each a border and the accent, which is what a row of links should look like.
   */
  return (
    <nav className={`srp-nav ${active === 'hub' ? 'srp-nav-links' : ''}`} aria-label={tReport('title')}>
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
