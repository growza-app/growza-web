'use client';

import { usePathname } from 'next/navigation';
import { visibleItems, type MemberRole } from '../lib/nav-policy';
import { homeCopy } from '../lib/home-copy';
import type { Lang } from '../lib/lang';
import {
  IconBell,
  IconCalendarPlus,
  IconNavAttendance,
  IconNavBookings,
  IconNavClients,
  IconNavHome,
  IconUserPlus,
} from './icons';

/**
 * Mobile navigation. Replaces the sidebar entirely below the mobile
 * breakpoint (see globals.css) — the frequent destinations in the thumb zone
 * rather than behind a hamburger.
 *
 * ## Jira GRW-222 — the raised centre action
 *
 * The floating "+" in the corner is gone. The design puts the one action that
 * matters most for the role in the middle of the bar, raised above it: New
 * booking for the owner, Walk-in for the front desk. Apple's own tab-bar
 * language has no floating button, and a button that floats over the content
 * is a button that covers a row — GRW-170 hid it on five screens for exactly
 * that. Attached to the bar, it covers nothing and needs no hiding list.
 *
 * A stylist cannot create a booking (`POST /api/v1/appointments` is not theirs,
 * GRW-156), so their bar is flat: four tabs, no centre action.
 *
 * Offers left the bar to make room; it is on the owner's Home quick links and
 * on More, one tap from either.
 */
export function BottomNav({
  labels,
  role,
  reportTabs,
  lang = 'en',
  onCentre,
}: {
  labels: Record<string, string>;
  role?: MemberRole | null;
  reportTabs?: readonly string[];
  lang?: Lang;
  /** Absent means no centre action (a stylist, or a screen where it would sit on a pinned Save). */
  onCentre?: () => void;
}) {
  const pathname = usePathname();
  const t = homeCopy(lang, labels);
  const stylist = role === 'staff';

  // Jira GRW-300 — "More" moved into the hamburger drawer (Sidebar, doubling
  // as the mobile nav — see MobileChrome/Sidebar): it was the 6th element
  // (5 flat tabs + the centre action) that made every slot here "very
  // contracted". Notifications stays a direct tab, after the role's other
  // frequent destinations — owner-requested, not buried in the drawer.
  const items = stylist
    ? [
        { href: '/', label: t.nav.home, icon: <IconNavHome /> },
        { href: '/appointments', label: t.nav.schedule, icon: <IconNavBookings /> },
        { href: '/attendance', label: t.nav.attendance, icon: <IconNavAttendance /> },
        { href: '/notifications', label: t.nav.notifications, icon: <IconBell /> },
      ]
    : [
        { href: '/', label: t.nav.home, icon: <IconNavHome /> },
        { href: '/appointments', label: t.nav.bookings, icon: <IconNavBookings /> },
        { href: '/customers', label: t.nav.clients, icon: <IconNavClients /> },
        { href: '/notifications', label: t.nav.notifications, icon: <IconBell /> },
      ];

  const visible = visibleItems(items, role, reportTabs);
  const centre = !stylist && onCentre;
  const half = Math.ceil(visible.length / 2);

  const tab = (item: (typeof visible)[number]) => {
    const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
    return (
      <a key={item.href} href={item.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
        {item.icon}
        {item.label}
        <span className="bn-mark" />
      </a>
    );
  };

  return (
    <nav className={`bottom-nav ${centre ? 'has-centre' : ''}`} aria-label="Main">
      {centre ? (
        <>
          {visible.slice(0, half).map(tab)}
          <button type="button" className="bn-centre" onClick={onCentre}>
            <span className="bn-centre-btn" aria-hidden>
              {role === 'receptionist' ? <IconUserPlus /> : <IconCalendarPlus />}
            </span>
            <span className="bn-centre-label">{role === 'receptionist' ? t.walkInShort : t.nav.newBooking}</span>
          </button>
          {visible.slice(half).map(tab)}
        </>
      ) : (
        visible.map(tab)
      )}
    </nav>
  );
}
