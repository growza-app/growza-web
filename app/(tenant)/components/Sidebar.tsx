'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { canSee, type MemberRole } from '../lib/nav-policy';
import { isActive, resolveNav, type NavGroup } from '../lib/nav-sections';
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
  IconProducts,
  IconReceipt,
  IconReports,
  IconServices,
  IconSettings,
  IconStaff,
  IconLogout,
  IconUserPlus,
  IconClipboardCheck,
  IconClose,
  IconChevronDown,
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
/** Where a person's folded and unfolded groups are kept on this device. */
const FOLDS_KEY = 'growza_nav_folds';

export function Sidebar({
  tenantName,
  labels,
  role,
  reportTabs,
  whatsappLive,
  whatsappDemo = false,
  products = true,
  lang,
  locationName,
  branchCount = 1,
  phone,
  name,
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
  /** Owner, 2026-10-14 — false for a plan that does not sell over the counter; the shelf is not offered. */
  products?: boolean;
  /** Jira GRW-222 — nav labels follow the Home language toggle. */
  lang?: Lang;
  /** Jira GRW-222 — the primary branch, under the business name. */
  locationName?: string | null;
  /** Jira GRW-225 — more than one: say how many instead of naming the primary. Owners only; the layout passes 1 for everyone else. */
  branchCount?: number;
  /** Jira GRW-222 — who is signed in, at the foot of the sidebar. */
  phone?: string | null;
  /** The person's own name; the role is shown instead until there is one. */
  name?: string | null;
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
  // Owner, 2026-10-15 — grouped by job. Routes are unchanged; a group's children show while one of them is open.
  const groups: NavGroup<ReactNode>[] = [
    { href: '/', label: t.nav.home, icon: <IconDashboard /> },
    {
      href: '/appointments',
      label: role === 'staff' ? t.nav.schedule : t.nav.bookings,
      icon: <IconAppointments />,
      children: [{ href: '/availability', label: t.nav.freeTimes }],
    },
    { href: '/sales', label: t.nav.sales, icon: <IconReceipt /> },
    { href: '/customers', label: t.nav.clients, icon: <IconUserPlus /> },
    {
      href: '',
      label: t.nav.catalogue,
      icon: <IconServices />,
      children: [
        { href: '/services', label: t.nav.services },
        { href: '/packages', label: t.nav.packages },
        // Owner, 2026-10-14 — what the till sells that nobody performs.
        ...(products === false ? [] : [{ href: '/products', label: t.nav.products }]),
        { href: '/offers', label: t.nav.offers },
      ],
    },
    {
      href: '',
      label: t.nav.team,
      icon: <IconStaff />,
      // GRW-170 — who was here sits with the people, not with the client list.
      children: [
        { href: '/providers', label: t.nav.staff },
        { href: '/attendance', label: t.nav.attendance },
      ],
    },
    { href: '/reports', label: t.nav.reports, icon: <IconReports /> },
    // Jira GRW-300 — reached from here on a phone; on a laptop the bell in the header is the same door.
    { href: '/notifications', label: t.nav.notifications, icon: <IconBell />, className: 'nav-phone-only' },
    // GRW-165 — marked a demo while WhatsApp is not live; Jira GRW-266 · GRW-271 — not listed in production at all.
    ...(whatsappDemo ? [{ href: '/try-whatsapp', label: t.nav.whatsapp, icon: <IconChat />, pill: whatsappLive ? null : t.nav.demo }] : []),
    { href: '/settings', label: t.nav.settings, icon: <IconSettings /> },
  ];
  const nav = resolveNav(groups, (href) => canSee(href, role, reportTabs, live));

  /*
   * Owner, 2026-10-15 — a group folds and unfolds. The open group is unfolded by default; a person's own choice
   * (a group they folded, or one they opened to look) is remembered on this device. Going to a screen inside a
   * group unfolds it again: they asked to be there.
   */
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  /** The groups the page in view is inside; read by the arrival check below, which runs before they are computed. */
  const currentLabelsRef = useRef<string[]>([]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FOLDS_KEY);
      const stored = saved ? (JSON.parse(saved) as Record<string, boolean>) : {};
      /*
       * Release review, 2026-10-16 — a sidebar link is a full page load, so the "going to a screen inside a group
       * unfolds it" rule cannot see a navigation. A page reached from ANOTHER page of this site was asked for: its
       * group unfolds. A reload (same path) or a fresh open (no referrer) keeps the fold the person left.
       */
      let from = '';
      try {
        const ref = document.referrer ? new URL(document.referrer) : null;
        if (ref && ref.origin === window.location.origin) from = ref.pathname;
      } catch {
        /* an odd referrer is no referrer */
      }
      if (from && from !== window.location.pathname) {
        for (const l of currentLabelsRef.current) delete stored[l];
        try {
          window.localStorage.setItem(FOLDS_KEY, JSON.stringify(stored));
        } catch {
          /* see below */
        }
      }
      if (saved || from) setFolds(stored);
    } catch {
      /* private window or blocked storage: the default is fine */
    }
  }, []);
  const remember = (next: Record<string, boolean>) => {
    setFolds(next);
    try {
      window.localStorage.setItem(FOLDS_KEY, JSON.stringify(next));
    } catch {
      /* the choice just lasts until the page is reloaded */
    }
  };
  const currentLabels = nav.filter((n) => n.children.length > 0 && n.routes.some((r) => isActive(pathname, r))).map((n) => n.label);
  currentLabelsRef.current = currentLabels;
  const currentKey = currentLabels.join('|');
  // Not on arrival: reloading the page a group is open on keeps it folded if that is how they left it.
  const arrivedAt = useRef(pathname);
  useEffect(() => {
    if (arrivedAt.current === pathname) return;
    arrivedAt.current = pathname;
    setFolds((prev) => {
      if (!currentLabels.some((l) => l in prev)) return prev;
      const next = { ...prev };
      for (const l of currentLabels) delete next[l];
      try {
        window.localStorage.setItem(FOLDS_KEY, JSON.stringify(next));
      } catch {
        /* see above */
      }
      return next;
    });
    // `currentKey` stands for `currentLabels`: it changes exactly when the open group does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, currentKey]);

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
          {nav.map((item) => {
            const current = item.routes.some((r) => isActive(pathname, r));
            const expandable = item.children.length > 0;
            const expanded = expandable && (folds[item.label] ?? current);
            const panel = `nav-children-${nav.indexOf(item)}`;
            return (
              <div key={item.label} className={`nav-group ${item.className ?? ''}`}>
                <div className="nav-row">
                  <a
                    href={item.href}
                    className={current ? 'active' : ''}
                    aria-current={current && (!expandable || !expanded) ? 'page' : undefined}
                    onClick={(e) => {
                      if (expandable) {
                        e.preventDefault();
                        remember({ ...folds, [item.label]: !expanded });
                        return;
                      }
                      close();
                    }}
                  >
                    {item.icon}
                    {item.label}
                    {item.pill ? <span className="nav-pill">{item.pill}</span> : null}
                  </a>
                  {expandable ? (
                    <button
                      type="button"
                      className={`nav-fold ${expanded ? 'is-open' : ''}`}
                      aria-expanded={expanded}
                      aria-controls={panel}
                      aria-label={expanded ? tc('foldGroup', { name: item.label }) : tc('unfoldGroup', { name: item.label })}
                      onClick={() => remember({ ...folds, [item.label]: !expanded })}
                    >
                      <IconChevronDown />
                    </button>
                  ) : null}
                </div>
                {expanded ? (
                  <div className="nav-children" id={panel}>
                    {/* A group that is a screen of its own (Bookings) lists itself first: the way back from Free times. */}
                    {item.self ? (
                      <a href={item.href} className={isActive(pathname, item.href) && !item.children.some((c) => isActive(pathname, c.href)) ? 'active' : ''} onClick={close}>
                        {item.label}
                      </a>
                    ) : null}
                    {item.children.map((c) => (
                      <a key={c.href} href={c.href} className={isActive(pathname, c.href) ? 'active' : ''} aria-current={isActive(pathname, c.href) ? 'page' : undefined} onClick={close}>
                        {c.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        {/* Jira GRW-66 · GRW-160 — outside `visibleItems`, deliberately. Every
            role can end their own session; a stylist on a shared salon device is
            the person who needs it most, and they see almost nothing above. */}
        <div className="nav-foot">
          {/* Jira GRW-222 — who is signed in. A role and a number, because a
              person IS their phone number here (GRW-189). Their own name leads
              once there is one; the role and number sit under it. */}
          <div className="nav-who">
            <span className="nav-who-avatar">{Array.from(name ?? t.role[role ?? 'owner'] ?? 'O')[0]?.toUpperCase()}</span>
            <span className="nav-who-text">
              <strong>{name ?? t.role[role ?? 'owner']}</strong>
              {name ? <span>{t.role[role ?? 'owner']}</span> : null}
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
