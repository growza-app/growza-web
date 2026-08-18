'use client';

import { usePathname } from 'next/navigation';
import { copy } from '../lib/copy';
import { IconAppointments, IconDots, IconGrid, IconOffers } from './icons';

/**
 * Mobile navigation. Replaces the sidebar entirely below the mobile
 * breakpoint (see globals.css) — putting the frequent destinations in the
 * thumb zone rather than behind a hamburger.
 *
 * Only four tabs, and every one resolves to a page that actually exists.
 * Everything rarer (staff, services, free times, settings) lives behind
 * "More", which is the one screen that lists them.
 */
export function BottomNav({ labels }: { labels: Record<string, string> }) {
  const pathname = usePathname();

  const items = [
    { href: '/', label: copy.nav.today, icon: <IconGrid /> },
    { href: '/appointments', label: labels.appointments ?? copy.nav.appointments, icon: <IconAppointments /> },
    { href: '/offers', label: copy.nav.offers, icon: <IconOffers /> },
    { href: '/more', label: copy.nav.more, icon: <IconDots /> },
  ];

  return (
    <nav className="bottom-nav">
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <a key={item.href} href={item.href} className={active ? 'active' : ''}>
            {item.icon}
            {item.label}
            <span className="bn-mark" />
          </a>
        );
      })}
    </nav>
  );
}
