'use client';

import { usePathname } from 'next/navigation';
import { visibleItems, type MemberRole } from '../lib/nav-policy';
import { homeCopy } from '../lib/home-copy';
import type { Lang } from '../lib/lang';
import {
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

  // Jira GRW-300 — back to 4 tabs (+ the centre action, where there is one).
  // Notifications (GRW-301) and More both moved into the hamburger drawer
  // (Sidebar, doubling as the mobile nav — see MobileChrome/Sidebar) rather
  // than sitting as 5th/6th flat tabs; that's what made every slot here
  // "very contracted" in the first place.
  const items = stylist
    ? [
        { href: '/', label: t.nav.home, icon: <IconNavHome /> },
        { href: '/appointments', label: t.nav.schedule, icon: <IconNavBookings /> },
        { href: '/attendance', label: t.nav.attendance, icon: <IconNavAttendance /> },
      ]
    : [
        { href: '/', label: t.nav.home, icon: <IconNavHome /> },
        { href: '/appointments', label: t.nav.bookings, icon: <IconNavBookings /> },
        { href: '/customers', label: t.nav.clients, icon: <IconNavClients /> },
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
    <nav className={`bottom-nav ${centre ? 'has-centre' : ''}`}>
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
