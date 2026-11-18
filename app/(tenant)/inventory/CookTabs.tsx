'use client';

import { useTranslations } from 'next-intl';
import AppLink from '../../shared/AppLink';
import { cooksOnly } from '../lib/areas';
import { useAreas, useMayOpen, useRecipesOn } from '../components/SessionProvider';

/**
 * Jira GRW-741 — a cook's app is two places: the kitchen screen and Inventory. A Kitchen login has no side menu and no tab bar (owner,
 * 2026-11-17: one job on a greasy tablet), so the kitchen screen's own bar carries Inventory, and Inventory carries these two tabs, Kitchen
 * first: the way back. Everyone else reaches both from the side menu and draws nothing here.
 */
export function CookTabs({ active }: { active: 'kitchen' | 'inventory' }) {
  const t = useTranslations('kitchenStock.cookTabs');
  const areas = useAreas();
  const mayOpen = useMayOpen();
  const recipesOn = useRecipesOn();
  if (!cooksOnly(areas.pages) || !recipesOn || !mayOpen('/kitchen') || !mayOpen('/inventory')) return null;
  const tabs = [
    { key: 'kitchen', href: '/kitchen' },
    { key: 'inventory', href: '/inventory' },
  ] as const;
  return (
    <nav className="prd-seg inv-cook-tabs" aria-label={t('label')}>
      {tabs.map((tab) => (
        <AppLink key={tab.key} href={tab.href} className={active === tab.key ? 'is-on' : ''} aria-current={active === tab.key ? 'page' : undefined}>
          {t(tab.key)}
        </AppLink>
      ))}
    </nav>
  );
}
