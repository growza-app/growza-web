'use client';

import { useTranslations } from 'next-intl';
import { Fragment, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ClientCartoon } from './ClientCartoon';
import { usePathname } from 'next/navigation';
import { canSee, type MemberRole } from '../lib/nav-policy';
import { cooksOnly } from '../lib/areas';
import { isActive, resolveNav, type NavGroup } from '../lib/nav-sections';
import { GrowzaMark } from './GrowzaMark';
import { homeCopy } from '../lib/home-copy';
import type { Lang } from '../lib/lang';
import { SignOutButton } from './SignOutButton';
import { useMobileNav } from './MobileNavProvider';
import { useAreas, useLive } from './SessionProvider';
import { HeaderBusiness } from './HeaderBusiness';
import { HeaderBranchPicker } from './HeaderBranchPicker';
import { AccountMenu } from './AccountMenu';
import { useClaimHeaderControls, useWideScreen } from './sidebar-controls';
import {
  IconAnalytics,
  IconAppointments,
  IconBell,
  IconChat,
  IconOffers,
  IconPackages,
  IconPos,
  IconProducts,
  IconInventory,
  IconReceipt,
  IconServices,
  IconSettings,
  IconStaff,
  IconLogout,
  IconUserPlus,
  IconClipboardCheck,
  IconClose,
  IconChevronDown,
  IconNavHome,
  IconCutlery,
  IconBarChart,
  IconBrandHouse,
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
/** Owner, 2026-11-24 (option A) — how long the pointer rests on the slim bar before it widens. */
export const RAIL_HOVER_DELAY_MS = 200;


/**
 * Emerald v2 — where the sidebar's "General" section starts: the WhatsApp demo and Settings, the rest is Main.
 * Matched by its tail so this file still spells the demo's link once, behind its guard (whatsapp-demo-links.test.ts).
 */
const isGeneral = (href: string | undefined) => href === '/settings' || (href ?? '').endsWith('whatsapp');
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

  /*
   * Owner, 2026-11-24 (option A) — on a laptop the sidebar is a slim bar of icons that widens over the page, names and
   * all, when the pointer rests on it (CSS, 99-zz-slim-rail.css). A screen with no pointer to rest (a tablet held
   * sideways, a touch laptop) opens it with the logo instead; a tap outside or Escape closes it again.
   */
  const [railOpen, setRailOpen] = useState(false);
  // The pointer resting on the bar opens it after a moment, so a pointer only passing over on its way to the page does not.
  const [railHover, setRailHover] = useState(false);
  const hoverTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const onRailEnter = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch') return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setRailHover(true), RAIL_HOVER_DELAY_MS);
  };
  const onRailLeave = () => {
    window.clearTimeout(hoverTimer.current);
    setRailHover(false);
  };
  useEffect(() => {
    if (!railOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!drawerRef.current?.contains(e.target as Node)) setRailOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRailOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [railOpen]);

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
  // Jira GRW-608 — which areas this business has: a shop is offered Orders and Stock and no diary or menu.
  const areas = useAreas();
  // Owner, 2026-10-15 — grouped by job. Routes are unchanged; a group's children show while one of them is open.
  const groups: NavGroup<ReactNode>[] = [
    { href: '/', label: t.nav.home, icon: <IconNavHome /> },
    // The till, one tap from Home. `canSee` gives it to whoever may open the till; a business that has turned
    // Products off has nothing on a shelf to sell, so it is not offered one.
    // Owner, 2026-11-24 — on a laptop's slim bar the till sits at the foot, as in the owner's reference (`nav-pos`, 99-zz-slim-rail.css).
    ...(products === false ? [] : [{ href: '/pos', label: t.nav.pos, icon: <IconPos />, className: 'nav-pos' }]),
    // Jira GRW-608 — a shop's own two screens. Absent for every other business: `canSee` answers false for them.
    { href: '/orders', label: t.nav.orders, icon: <IconReceipt /> },
    // Owner, 2026-11-20 — a kitchen's Menu reads as a menu (a fork and a knife); a shop's counted Stock keeps the product.
    { href: '/stock', label: t.nav.stock, icon: areas.stock === false ? <IconCutlery /> : <IconProducts /> },
    // Jira GRW-741 — Inventory, below the Menu: only where the business keeps kitchen stock, to the roles that may open it (`canSee`).
    { href: '/inventory', label: t.nav.inventory, icon: <IconInventory /> },
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
        // A shop's shelf is its Stock row above; the same screen is not offered twice.
        ...(products === false || areas.shop ? [] : [{ href: '/products', label: t.nav.products }]),
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
        /*
         * QA 2026-11-14 (F5) — a shop has no Staff roster (`/providers` is not a shop's), so its people and their logins
         * live on Settings › Team and roles. The Team fold opened only Attendance, and a retail owner looking for "add a
         * staff member" found nothing. Policy decides who sees it (a shop's, never a salon's — `SHOP_SETTINGS`), and the
         * owner alone, as Settings lists it (`shopOwnerOnly`): the roles API answers the owner only, and the allowlist's
         * "a manager is an owner" would otherwise offer a manager a screen that says there is nothing here.
         */
        ...(role === 'owner' ? [{ href: '/settings/roles', label: t.nav.staff }] : []),
        { href: '/attendance', label: t.nav.attendance },
      ],
    },
    { href: '/reports', label: t.nav.reports, icon: <IconBarChart /> },
    // Jira GRW-300 — reached from here on a phone; on a laptop the bell in the header is the same door.
    { href: '/notifications', label: t.nav.notifications, icon: <IconBell />, className: 'nav-phone-only' },
    // GRW-165 — marked a demo while WhatsApp is not live; Jira GRW-266 · GRW-271 — not listed in production at all.
    ...(whatsappDemo ? [{ href: '/try-whatsapp', label: t.nav.whatsapp, icon: <IconChat />, pill: whatsappLive ? null : t.nav.demo }] : []),
    { href: '/settings', label: t.nav.settings, icon: <IconSettings /> },
  ];
  const nav = resolveNav(groups, (href) => canSee(href, role, reportTabs, live, areas));

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

  // Owner, 2026-11-20 (option A) — on a laptop the business and the account menu are the sidebar's (the bell is the
  // page head's, `PageHeadBell`); the
  // header unmounts its copies once claimed (`sidebar-controls.ts`). Not when this sidebar is not drawn (below).
  const wide = useWideScreen();
  const drawn = !(nav.every((n) => n.href === '/notifications') || cooksOnly(areas.pages));
  const controlsHere = wide === true && drawn;
  useClaimHeaderControls(controlsHere);

  /*
   * Owner, 2026-11-17 — a login offered no screen in the list (a Kitchen login: its one screen is where it already is) gets
   * no sidebar at all: an empty column the width of a ticket was all it drew (its one row, Notifications, is not drawn there). The page takes the width
   * (`.shell:not(:has(> .sidebar))`), and that screen carries its own Sign out.
   */
  // Notifications alone is not a list: on a laptop the theme does not draw it there, and a kitchen has nothing to be told.
  if (nav.every((n) => n.href === '/notifications')) return null;
  // Jira GRW-741 — nor does a Kitchen login now that Inventory is theirs too: its two places carry their own tabs (`inventory/CookTabs.tsx`).
  if (cooksOnly(areas.pages)) return null;

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
        data-rail={railOpen || railHover ? 'open' : undefined}
        onPointerEnter={onRailEnter}
        onPointerLeave={onRailLeave}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? tc('menu') : undefined}
        onKeyDown={keepFocusInside}
      >
        {/* Emerald v3 (owner, 14 Nov 2026) — on a laptop the sidebar's top is Growza's; the business moved to the header bar. */}
        <div className="brand-growza">
          {/* Owner, 2026-11-24 — the logo opens and closes the slim bar where there is no pointer to rest on it. */}
          <button
            type="button"
            className="rail-toggle"
            aria-expanded={railOpen}
            aria-controls="site-menu"
            aria-label={railOpen ? tc('closeMenu') : tc('menu')}
            onClick={() => setRailOpen((o) => !o)}
          >
            <GrowzaMark size={36} />
          </button>
          <span className="brand-growza-word">{tc('productName')}</span>
        </div>
        {controlsHere ? (
          <div className="sb-biz">
            {/* Owner, 2026-11-20 — the business as a card: a shop front, its name, the branch; it opens the branch list when there are several. */}
            <span className="sb-biz-icon" aria-hidden="true">
              {/* Owner, 2026-11-26 — the same red-roof house as the phone menu's card, for every business. */}
              <IconBrandHouse />
            </span>
            <HeaderBusiness />
            <HeaderBranchPicker />
          </div>
        ) : wide === null && drawn ? (
          /*
           * Owner, 2026-11-23 ("when coming back to home … the page shows some glitch") — a menu tap reloads the page,
           * and until the screen's width is known the card above was missing, so every menu row dropped 64px a moment
           * later. Its empty box holds the place; the stylesheet hides it on a phone, as it hides the card.
           */
          <div className="sb-biz is-placeholder" aria-hidden="true" />
        ) : null}
        <div className="brand">
          {/* Owner, 2026-11-20 — the phone drawer's business is the laptop's card: a shop front, not the first letter. */}
          <div className="brand-card">
          <div className="brand-badge" aria-hidden="true">
            <IconBrandHouse />
          </div>
          <div className="brand-text">
            <div className="brand-name">{tenantName}</div>
            {branchCount > 1 ? <div className="brand-location">{t.branchCount(branchCount)}</div> : locationName ? <div className="brand-location">{locationName}</div> : null}
          </div>
          </div>
          <button type="button" className="sidebar-close" aria-label={tc('closeMenu')} onClick={close}>
            <IconClose />
          </button>
        </div>
        <nav className="nav" aria-label={tc('main')}>
          {/* Jira GRW-66 · GRW-157 — a stylist is offered what they can use. The
              API is what refuses (GRW-156); this is about not wasting their time
              on eight links that 403. */}
          {/* Emerald v2 — the laptop's two section labels; the phone drawer does not draw them (99-z-emerald-v2.css). */}
          <span className="nav-section">{t.nav.sectionMain}</span>
          {nav.map((item) => {
            const current = item.routes.some((r) => isActive(pathname, r));
            const firstGeneral = nav.find((n) => isGeneral(n.href));
            const expandable = item.children.length > 0;
            const expanded = expandable && (folds[item.label] ?? current);
            const panel = `nav-children-${nav.indexOf(item)}`;
            return (
              <Fragment key={item.label}>
              {item === firstGeneral ? <span className="nav-section">{t.nav.sectionGeneral}</span> : null}
              <div className={`nav-group ${item.className ?? ''}`}>
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
                    {/* Its own element so the slim bar can fade the word while keeping it the link's name. */}
                    <span className="nav-label">{item.label}</span>
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
              </Fragment>
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
            {/* Emerald v3 — the same drawn face as the header's account button, from the same number. */}
            <ClientCartoon id={phone ?? name ?? tenantName ?? 'me'} className="nav-who-avatar" />
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
        {controlsHere ? (
          <div className="sb-acct">
            <AccountMenu />
          </div>
        ) : null}
      </aside>
    </>
  );
}
