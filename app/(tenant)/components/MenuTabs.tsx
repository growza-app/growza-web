'use client';

import AppLink from '../../shared/AppLink';
import { useTranslations } from 'next-intl';
import { useMayOpen, useRecipesOn } from './SessionProvider';

/**
 * Jira GRW-737 — a kitchen's Menu has two halves: the dishes it sells, and the raw materials they are made of. Drawn only where the business
 * may keep kitchen stock (a restaurant) and the person may open both; anywhere else (and for a cook, whose app is the kitchen and who opens
 * only the stock half) this draws nothing.
 */
export function MenuTabs({ active }: { active: 'dishes' | 'stock' }) {
  const t = useTranslations('kitchenStock');
  const recipesOn = useRecipesOn();
  const mayOpen = useMayOpen();
  if (!recipesOn || !mayOpen('/stock/kitchen') || !mayOpen('/stock')) return null;
  const tabs = [
    { key: 'dishes', href: '/stock', label: t('tabDishes') },
    { key: 'stock', href: '/stock/kitchen', label: t('tabStock') },
  ] as const;
  return (
    <nav className="prd-seg ks-tabs" aria-label={t('title')}>
      {tabs.map((tab) => (
        <AppLink key={tab.key} href={tab.href} className={active === tab.key ? 'is-on' : ''} aria-current={active === tab.key ? 'page' : undefined}>
          {tab.label}
        </AppLink>
      ))}
    </nav>
  );
}
