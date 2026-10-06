'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { visibleItems, type MemberRole } from '../lib/nav-policy';
import { useLive } from './SessionProvider';
import { homeCopy } from '../lib/home-copy';
import type { Lang } from '../lib/lang';
import { useUnreadNotifications } from './useUnreadNotifications';
import {
  IconBell,
  IconNavAttendance,
  IconNavBookings,
  IconNavClients,
  IconRupee,
  IconNavHome,
  IconPlus,
  IconServices,
  IconSettings,
  IconStaff,
} from './icons';

/**
 * Mobile navigation. Replaces the sidebar entirely below the mobile
 * breakpoint (see globals.css) — the frequent destinations in the thumb zone
 * rather than behind a hamburger.
 *
 * ## Jira GRW-495 — the action floats at the bottom right
 *
 * It left the middle of the bar for the corner above it, the way Compose sits in Gmail and
 * Outlook: a plus-only round button (its name is the aria-label), anchored to the bar so it follows the bar's height at any
 * text size and clears the home indicator. The bar is four flat tabs again. The paragraph below
 * is the history that put it in the middle (GRW-222); the placement is the part that changed.
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
  onPayment,
}: {
  labels: Record<string, string>;
  role?: MemberRole | null;
  reportTabs?: readonly string[];
  lang?: Lang;
  /** Absent means no centre action (a stylist, or a screen where it would sit on a pinned Save). */
  onCentre?: () => void;
  /**
   * Record payment, offered beside New booking. Present only for someone who may record a payment; with it the
   * plus opens a two-choice menu, without it the plus goes straight to New booking as it always did.
   */
  onPayment?: () => void;
}) {
  const tc = useTranslations('chrome');
  const pathname = usePathname();
  const t = homeCopy(lang, labels);
  const navRef = useRef<HTMLElement>(null);
  const unread = useUnreadNotifications(navRef);
  const stylist = role === 'staff';
  // Jira GRW-556 — until the business is live, the bar is the setup: Home, the menu, the people, the settings.
  const live = useLive();

  // Jira GRW-300 — "More" moved into the hamburger drawer (Sidebar, doubling
  // as the mobile nav — see MobileChrome/Sidebar): it was the 6th element
  // (5 flat tabs + the centre action) that made every slot here "very
  // contracted". Notifications stays a direct tab, after the role's other
  // frequent destinations — owner-requested, not buried in the drawer.
  const items = !live
    ? [
        { href: '/', label: t.nav.home, icon: <IconNavHome /> },
        { href: '/services', label: t.nav.services, icon: <IconServices /> },
        { href: '/providers', label: t.nav.staff, icon: <IconStaff /> },
        { href: '/settings', label: t.nav.settings, icon: <IconSettings /> },
      ]
    : stylist
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

  const visible = visibleItems(items, role, reportTabs, live);
  const centre = !stylist && onCentre;
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = Boolean(centre && onPayment);

  // Escape closes the menu, and so does leaving the screen it was opened on.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  useEffect(() => setMenuOpen(false), [pathname]);

  /*
   * Jira GRW-556 — a bar with one tab is not a tab bar.
   *
   * Before go-live the bar is the four setup screens, and a receptionist or a stylist may see none of them: the
   * role filter above left them a single full-width "Home" capsule, pointing at the screen they were already on.
   * Nothing to switch between means no bar — the same answer this component already gives New booking below.
   */
  if (visible.length < 2 && !centre) return null;

  const tab = (item: (typeof visible)[number]) => {
    const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
    // Jira GRW-338 — the Notifications tab carries the count, the way the desktop bell does; past 9 it reads "9+".
    const count = item.href === '/notifications' ? unread : 0;
    return (
      <a
        key={item.href}
        href={item.href}
        className={active ? 'active' : ''}
        aria-current={active ? 'page' : undefined}
        aria-label={count > 0 ? `${item.label}, ${t.unreadCount(count)}` : undefined}
      >
        {count > 0 ? (
          <span className="bn-icon">
            {item.icon}
            <span className="bn-badge" aria-hidden="true">{count > 9 ? '9+' : count}</span>
          </span>
        ) : (
          item.icon
        )}
        {/* Jira GRW-481 — the label is its own element so it can give way. Five fixed
            slots across a phone, and the label grows with the reader's text size; as a
            bare text node it had nothing CSS could shorten, so at a large size the five
            labels ran into one another and the last left the screen. The accessible
            name above is never truncated. */}
        <span className="bn-label">{item.label}</span>
        <span className="bn-mark" />
      </a>
    );
  };

  return (
    <nav ref={navRef} className={`bottom-nav ${centre ? 'has-centre' : ''} ${menuOpen ? 'menu-open' : ''}`} aria-label={tc('main')}>
      {visible.map(tab)}
      {centre ? (
        <>
          {/* Owner, 2026-10-06 — the plus opens a speed-dial: New booking, or Record payment. Tapping anywhere else closes it. */}
          {/* In the body, not the bar: the bar's blur makes it the containing block of anything fixed inside it, which would dim only the bar. */}
          {menu && typeof document !== 'undefined'
            ? createPortal(
                <div className={`bn-scrim ${menuOpen ? 'is-open' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />,
                document.body,
              )
            : null}
          {menu ? (
            <div className={`bn-menu ${menuOpen ? 'is-open' : ''}`} id="bn-menu" role="menu" aria-label={t.nav.newBooking}>
              <button
                type="button"
                role="menuitem"
                className="bn-menu-item"
                style={{ '--i': 1 } as CSSProperties}
                tabIndex={menuOpen ? 0 : -1}
                onClick={() => {
                  setMenuOpen(false);
                  onPayment?.();
                }}
              >
                <span className="bn-menu-label">{t.recordPayment}</span>
                <span className="bn-menu-icon" aria-hidden>
                  <IconRupee />
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="bn-menu-item"
                style={{ '--i': 2 } as CSSProperties}
                tabIndex={menuOpen ? 0 : -1}
                onClick={() => {
                  setMenuOpen(false);
                  onCentre?.();
                }}
              >
                <span className="bn-menu-label">{t.nav.newBooking}</span>
                <span className="bn-menu-icon" aria-hidden>
                  <IconNavBookings />
                </span>
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className={`bn-centre ${menuOpen ? 'is-open' : ''}`}
            onClick={menu ? () => setMenuOpen((o) => !o) : onCentre}
            aria-label={role === 'receptionist' ? t.walkInShort : t.nav.newBooking}
            aria-haspopup={menu ? 'menu' : undefined}
            aria-expanded={menu ? menuOpen : undefined}
            aria-controls={menu ? 'bn-menu' : undefined}
          >
            <span className="bn-centre-btn" aria-hidden>
              <IconPlus />
            </span>
          </button>
        </>
      ) : null}
    </nav>
  );
}
