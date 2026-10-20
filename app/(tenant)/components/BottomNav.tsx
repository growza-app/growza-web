'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { visibleItems, type MemberRole } from '../lib/nav-policy';
import { useAreas, useLive } from './SessionProvider';
import { homeCopy } from '../lib/home-copy';
import type { Lang } from '../lib/lang';
import { useUnreadNotifications } from './useUnreadNotifications';
import {
  IconBell,
  IconNavAttendance,
  IconNavBookings,
  IconNavClients,
  IconNavOrders,
  IconNavStock,
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
  // Jira GRW-608 — a shop's bar is Home, Orders, Stock, Clients and the bell; a salon's is unchanged.
  const areas = useAreas();

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
        // Jira GRW-608 — for a shop, counting the shelf is setting up. Hidden for every other business.
        { href: '/stock', label: t.nav.stock, icon: <IconNavStock /> },
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
        // Jira GRW-608 — offered only to a business that runs the shop's screens; `canSee` hides them for every other.
        { href: '/orders', label: t.nav.orders, icon: <IconNavOrders /> },
        { href: '/stock', label: t.nav.stock, icon: <IconNavStock /> },
        { href: '/customers', label: t.nav.clients, icon: <IconNavClients /> },
        { href: '/notifications', label: t.nav.notifications, icon: <IconBell /> },
      ];

  const visible = visibleItems(items, role, reportTabs, live, areas);
  // Owner, 2026-10-15 — the plus is Home's. Elsewhere it sat on the corner of every list and form, so it is not drawn
  // there at all; New booking is one tap from Home, and the screens that need it have their own button.
  const centre = !stylist && onCentre && pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = Boolean(centre && onPayment);

  /*
   * The scrim below is a portal, and a portal is a child position like any other. Testing `typeof document` to
   * decide whether to render it put a child there on the client that the server had not written, so React
   * hydrated the menu against the scrim and threw the whole bar away to re-render it. Mount first, portal second:
   * the first client render then matches the server's, and the scrim arrives on the pass after.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /*
   * The plus steps aside while you read down a list, and comes back the moment you scroll up (owner, 2026-10-13).
   *
   * It floats over the bottom right of the page, so on a long list it sits on top of a row — on Bookings, over a
   * card's price. Going away while the thumb is travelling down and returning on the way up is what Material,
   * Gmail and the Play Store all do: the button is in reach whenever someone has stopped to look at something,
   * and out of the way while they are moving past it.
   *
   * Capture phase on `document`, because a scroll event does not bubble and the thing that scrolls is not the
   * window — it is whichever `.page-body` the screen rendered. One listener, no screen has to opt in.
   */
  const [away, setAway] = useState(false);
  const stays = pathname === '/';
  const centreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    /** How far a scroll has to travel before it counts: a tap that nudges the list by a pixel is not a direction. */
    const TRAVEL = 8;
    /** Above this, the button always shows — the top of a list is where "add one" is most likely next. */
    const NEAR_TOP = 80;
    const seen = new WeakMap<EventTarget, number>();

    const onScroll = (e: Event) => {
      const el = e.target instanceof Document ? document.documentElement : (e.target as HTMLElement | null);
      if (!el) return;
      const y = el.scrollTop;
      const last = seen.get(e.target as EventTarget) ?? 0;
      seen.set(e.target as EventTarget, y);
      const moved = y - last;
      if (Math.abs(moved) < TRAVEL) return;
      // Never while the two-choice menu is open, and never out from under the keyboard: a button that vanishes
      // while it holds the focus leaves a keyboard somewhere with nothing selected.
      if (menuOpen || document.activeElement === centreRef.current) return;
      // Owner, 2026-10-15 — never on Home. It is a dashboard of cards, not a list of rows with a price at the
      // right edge, so there is nothing for the plus to cover; reaching "Needs your attention" and finding it
      // gone read as a fault.
      if (stays) return;
      setAway(moved > 0 && y > NEAR_TOP);
    };

    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, [menuOpen, stays]);

  // A route change is a fresh screen at the top of itself.
  useEffect(() => setAway(false), [pathname]);

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
          {menu && mounted
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
            ref={centreRef}
            className={`bn-centre ${menuOpen ? 'is-open' : ''} ${away ? 'is-away' : ''}`}
            // Out of sight is out of the tab order too, so nobody tabs to a button they cannot see.
            tabIndex={away ? -1 : undefined}
            aria-hidden={away || undefined}
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
