'use client';

import { usePathname } from 'next/navigation';
import { visibleItems, type MemberRole } from '../lib/nav-policy';
import { copy } from '../lib/copy';
import { IconAppointments, IconCheck, IconDots, IconGrid, IconOffers, IconUserPlus } from './icons';

/**
 * Mobile navigation. Replaces the sidebar entirely below the mobile
 * breakpoint (see globals.css) — putting the frequent destinations in the
 * thumb zone rather than behind a hamburger.
 *
 * Five tabs, and every one resolves to a page that actually exists.
 * Everything rarer (staff, services, free times, settings) lives behind
 * "More", which is the one screen that lists them.
 */
export function BottomNav({ labels, role }: { labels: Record<string, string>; role?: MemberRole | null }) {
  const pathname = usePathname();

  const items = [
    // Same label as the sidebar's first item — this is the same route, and
    // calling it "Today" on a phone and "Home" on a laptop read as two places.
    { href: '/', label: copy.nav.dashboard, icon: <IconGrid /> },
    { href: '/appointments', label: labels.appointments ?? copy.nav.appointments, icon: <IconAppointments /> },
    { href: '/customers', label: labels.customers ?? copy.nav.customers, icon: <IconUserPlus /> },
    { href: '/offers', label: copy.nav.offers, icon: <IconOffers /> },
    // GRW-170/170 — the register is a front-desk tab, not an owner one. The
    // bar is five fixed slots; see the trim below.
    { href: '/attendance', label: 'Attendance', icon: <IconCheck /> },
    { href: '/more', label: copy.nav.more, icon: <IconDots /> },
  ];

  /**
   * The bar is a five-slot grid and a sixth item overflows it.
   *
   * An owner already has five and reaches Attendance from More, so they lose
   * nothing. A receptionist cannot see Home or Offers, which leaves them three
   * — and the register, which they fill in every morning, is the obvious
   * fourth. So the trim drops Attendance only when the bar is actually full,
   * rather than hiding it from the one role that lives on it.
   */
  const visible = visibleItems(items, role);
  const shown = visible.length > 5 ? visible.filter((i) => i.href !== '/attendance') : visible;

  return (
    <nav className="bottom-nav">
      {shown.map((item) => {
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
