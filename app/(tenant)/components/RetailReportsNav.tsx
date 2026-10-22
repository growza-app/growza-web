'use client';

import { useLocale, useTranslations } from 'next-intl';
import AppLink from '../../shared/AppLink';
import { homeCopy } from '../lib/home-copy';

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

  const tabs: Array<{ key: RetailReportTab; href: string; label: string }> = [
    { key: 'channels', href: '/stock/channels', label: tChannels('title') },
    { key: 'sellers', href: '/stock/sellers', label: tSellers('title') },
    { key: 'report', href: '/stock/report', label: tReport('title') },
    { key: 'order', href: '/stock/order', label: tOrder('title') },
    { key: 'returns', href: '/orders/returns', label: tReturns('title') },
    { key: 'refunds', href: '/orders/refunds', label: tRefunds('title') },
  ];

  return (
    <nav className="srp-nav" aria-label={tReport('title')}>
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

/**
 * Retail Reports Hub shown on `/reports` for a business that takes no bookings:
 * gives 1-click access to all 6 retail analytics and stock/order reports.
 */
export function RetailReportsHub() {
  const locale = useLocale();
  const viewAll = homeCopy(locale === 'hi' ? 'hi' : 'en').shop.viewOrders;
  const tChannels = useTranslations('products.channels');
  const tSellers = useTranslations('products.sellers');
  const tReport = useTranslations('products.stockReport');
  const tOrder = useTranslations('products.reorder');
  const tReturns = useTranslations('orders.returns');
  const tRefunds = useTranslations('orders.refunds');

  const cards = [
    {
      href: '/stock/channels',
      title: tChannels('title'),
      sub: tChannels('billed'),
    },
    {
      href: '/stock/sellers',
      title: tSellers('title'),
      sub: `${tSellers('viewBest')} · ${tSellers('viewDead')}`,
    },
    {
      href: '/stock/report',
      title: tReport('title'),
      sub: tReport('totalsLabel'),
    },
    {
      href: '/stock/order',
      title: tOrder('title'),
      sub: tOrder('howFarAhead'),
    },
    {
      href: '/orders/returns',
      title: tReturns('title'),
      sub: `${tReturns('customerTitle')} · ${tReturns('undeliveredTitle')}`,
    },
    {
      href: '/orders/refunds',
      title: tRefunds('title'),
      sub: tRefunds('total'),
    },
  ];

  return (
    <div className="srp srp-stock">
      <ul className="srp-list">
        {cards.map((c) => (
          <li key={c.href} className="srp-card">
            <div className="srp-head">
              <h2 className="srp-name">{c.title}</h2>
              <AppLink className="btn btn-ghost srp-export" href={c.href}>
                {viewAll}
              </AppLink>
            </div>
            <p className="srp-hint">{c.sub}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
