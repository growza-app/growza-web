'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Emerald v3 (owner, 14 Nov 2026: "fix all") — on a laptop, Settings opens its first section instead of a big
 * empty pane saying "Pick a section". The first link is read from the list itself, so it is always one this
 * person may open (the list already filters by role, branch and what the business has switched on).
 * A phone is unchanged: there the hub route IS the list.
 */
export function SettingsOpenFirst() {
  const router = useRouter();
  useEffect(() => {
    if (!window.matchMedia('(min-width: 861px)').matches) return;
    const first = document.querySelector<HTMLAnchorElement>('.settings-group a.settings-row[href]');
    const href = first?.getAttribute('href');
    if (href) router.replace(href);
  }, [router]);
  return null;
}
