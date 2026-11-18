'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import AppLink from '../../shared/AppLink';
import { useMayOpen } from '../components/SessionProvider';
import { INVENTORY_TABS, type InventoryTab } from './tabs';

/**
 * Jira GRW-741 — Stock · Buy · Suppliers · Recipes · Reports. Each is its own address, so a tab is a link (Back works, a tab can be shared).
 * A person is shown the tabs they may open: the cook Stock and Buy, the counter Stock, Buy and Recipes, the owner and a manager all five.
 * At 344px in Hindi the row can be wider than the phone: it then scrolls inside itself, never the page, and the current tab is brought into
 * view on arrival.
 */
export function InventoryTabs({ active }: { active: InventoryTab }) {
  const t = useTranslations('kitchenStock.tabs');
  const mayOpen = useMayOpen();
  const tabs = INVENTORY_TABS.filter((tab) => tab.key === active || mayOpen(tab.href));
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
  }, [active]);
  if (tabs.length < 2) return null;
  return (
    <nav ref={navRef} className="inv-tabs" aria-label={t('label')}>
      {tabs.map((tab) => (
        <AppLink
          key={tab.key}
          href={tab.href}
          className={`inv-tab ${tab.key === active ? 'is-on' : ''}`}
          aria-current={tab.key === active ? 'page' : undefined}
        >
          {t(tab.key)}
        </AppLink>
      ))}
    </nav>
  );
}
