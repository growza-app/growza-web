'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { visibleItems, type MemberRole } from '../lib/nav-policy';
import { homeCopy } from '../lib/home-copy';
import type { Lang } from '../lib/lang';
import { SignOutButton } from './SignOutButton';
import { useMobileNav } from './MobileNavProvider';
import { useLive } from './SessionProvider';
import {
  IconAnalytics,
  IconAppointments,
  IconBell,
  IconChat,
  IconDashboard,
  IconOffers,
  IconPackages,
  IconReports,
  IconServices,
  IconSettings,
  IconStaff,
  IconLogout,
  IconUserPlus,
  IconClipboardCheck,
  IconClose,
} from './icons';

/**
 * Desktop navigation. Below the mobile breakpoint it becomes the hamburger's
 * off-canvas drawer instead — same nav, same component, just a different
 * frame (Jira GRW-300, matching how the admin portal's own sidebar doubles
 * as its drawer: "the sidebar already gives a laptop this same nav with no
 * drawer needed"). The toggle is `MenuButton`, drawn inside each screen's own
 * header row (Jira GRW-306 — it used to float over the screen and cover page
 * titles); it and this component read the same `useMobileNav()` state.
 *
 * Domain nouns come from ctx.labels (the vertical config) — "Staff" for a
 * salon, "Doctors" for a clinic. Everything else is plain-language UI copy
 * from lib/copy.ts. See 07-product-surfaces.md §1.1.
 */
export function Sidebar({
  tenantName,
  labels,
  role,
  reportTabs,
  whatsappLive,
  whatsappDemo = false,
  lang,
  locationName,
  branchCount = 1,
  phone,
}: {
  tenantName: string;
  labels: Record<string, string>;
  role?: MemberRole | null;
  /** GRW-197 — report tabs this caller may open; an empty list hides the Reports link. */
  reportTabs?: readonly string[];
  /** Jira GRW-158 · GRW-165 — false until this business's WhatsApp number is switched on. */
  whatsappLive?: boolean;
  /** Jira GRW-266 · GRW-271 — false in production, where the Try WhatsApp demo does not exist. */
  whatsappDemo?: boolean;
  /** Jira GRW-222 — nav labels follow the Home language toggle. */
  lang?: Lang;
  /** Jira GRW-222 — the primary branch, under the business name. */
  locationName?: string | null;
  /** Jira GRW-225 — more than one: say how many instead of naming the primary. Owners only; the layout passes 1 for everyone else. */
  branchCount?: number;
  /** Jira GRW-222 — who is signed in, at the foot of the sidebar. */
  phone?: string | null;
}) {
  const tc = useTranslations('chrome');
  const pathname = usePathname();
  const t = homeCopy(lang ?? 'en', labels);
  const { open, close } = useMobileNav();
  const drawerRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  /**
   * Jira GRW-306 — the drawer is a real modal while it is open: focus moves in,
   * Tab stays inside, Escape closes, and focus goes back to the button that
   * opened it. Closed, it is `visibility: hidden` (see the mobile CSS), so its
   * links are neither tabbable nor read out from off-screen. On a laptop
   * `open` is never set and none of this runs.
   */
  useEffect(() => {
    if (open) {
      drawerRef.current?.querySelector<HTMLElement>('.sidebar-close')?.focus();
    } else if (wasOpen.current) {
      document.querySelector<HTMLElement>('.menu-btn')?.focus();
    }
    wasOpen.current = open;
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const keepFocusInside = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (!open || e.key !== 'Tab') return;
    const nodes = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Only routes that exist. Calendar is still in the design but has no page
  // yet — listing it here would be a link to a 404.
  // Jira GRW-556 — while the business is being set up only the setup screens are offered.
  const live = useLive();
  const items: { href: string; label: string; icon: ReactNode; pill?: string | null }[] = [
    { href: '/', label: t.nav.home, icon: <IconDashboard /> },
    { href: '/appointments', label: role === 'staff' ? t.nav.schedule : t.nav.bookings, icon: <IconAppointments /> },
    // Jira GRW-300 — moved off the bottom tab bar, which a 5th flat tab plus
    // the raised centre action made "very contracted" (owner-reported). Same
    // destination (`notifications/page.tsx`), reached from here now.
    { href: '/notifications', label: t.nav.notifications, icon: <IconBell /> },
    { href: '/providers', label: t.nav.staff, icon: <IconStaff /> },
    { href: '/services', label: t.nav.services, icon: <IconServices /> },
    // Jira GRW-438 — beside Services, because a package is made of them and the owner edits the two together.
    { href: '/packages', label: t.nav.packages, icon: <IconPackages /> },
    { href: '/offers', label: t.nav.offers, icon: <IconOffers /> },
    { href: '/customers', label: t.nav.clients, icon: <IconUserPlus /> },
    // GRW-170 — who was here. Sits beside the client list because it is the
    // other thing the front desk keeps, and next to Staff it would read as
    // part of hiring, which it is not.
    { href: '/attendance', label: t.nav.attendance, icon: <IconClipboardCheck /> },
    // Reports is added; nothing is removed (GRW-48 decision 2).
    { href: '/reports', label: t.nav.reports, icon: <IconReports /> },
    { href: '/availability', label: t.nav.freeTimes, icon: <IconAnalytics /> },
    // GRW-165 — marked a demo while WhatsApp is not live, so nobody reads a
    // working simulator as a working channel. Jira GRW-266 · GRW-271 — and not listed at
    // all in production, where the simulator is switched off.
    ...(whatsappDemo ? [{ href: '/try-whatsapp', label: t.nav.whatsapp, icon: <IconChat />, pill: whatsappLive ? null : t.nav.demo }] : []),
    { href: '/settings', label: t.nav.settings, icon: <IconSettings /> },
  ];

  return (
    <>
      {/* Jira GRW-300 — the drawer's scrim. Desktop never sets `open` (the
          toggle that would is mobile-only), so this never mounts there. */}
      {open && <div className="sidebar-backdrop" onClick={close} aria-hidden="true" />}
      <aside
        ref={drawerRef}
        id="site-menu"
        className="sidebar"
        data-open={open}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? tc('menu') : undefined}
        onKeyDown={keepFocusInside}
      >
        <div className="brand">
          <div className="brand-badge">{tenantName.charAt(0).toUpperCase()}</div>
          <div className="brand-text">
            <div className="brand-name">{tenantName}</div>
            {branchCount > 1 ? <div className="brand-location">{t.branchCount(branchCount)}</div> : locationName ? <div className="brand-location">{locationName}</div> : null}
          </div>
          <button type="button" className="sidebar-close" aria-label={tc('closeMenu')} onClick={close}>
            <IconClose />
          </button>
        </div>
        <nav className="nav" aria-label={tc('main')}>
          {/* Jira GRW-66 · GRW-157 — a stylist is offered what they can use. The
              API is what refuses (GRW-156); this is about not wasting their time
              on eight links that 403. */}
          {visibleItems(items, role, reportTabs, live).map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={(item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)) ? 'active' : ''}
              aria-current={(item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)) ? 'page' : undefined}
              onClick={close}
            >
              {item.icon}
              {item.label}
              {item.pill ? <span className="nav-pill">{item.pill}</span> : null}
            </a>
          ))}
        </nav>
        {/* Jira GRW-66 · GRW-160 — outside `visibleItems`, deliberately. Every
            role can end their own session; a stylist on a shared salon device is
            the person who needs it most, and they see almost nothing above. */}
        <div className="nav-foot">
          {/* Jira GRW-222 — who is signed in. A role and a number, because a
              person IS their phone number here (GRW-189) and the product holds
              no display name for a login. */}
          <div className="nav-who">
            <span className="nav-who-avatar">{t.role[role ?? 'owner']?.charAt(0) ?? 'O'}</span>
            <span className="nav-who-text">
              <strong>{t.role[role ?? 'owner']}</strong>
              {phone ? <span>{phone}</span> : null}
            </span>
          </div>
          <SignOutButton className="nav-signout">
            <IconLogout />
            {t.nav.signOut}
          </SignOutButton>
        </div>
      </aside>
    </>
  );
}
