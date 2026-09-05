'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { visibleItems, type MemberRole } from '../lib/nav-policy';
import { copy } from '../lib/copy';
import { SignOutButton } from './SignOutButton';
import {
  IconAnalytics,
  IconAppointments,
  IconChat,
  IconDashboard,
  IconOffers,
  IconReports,
  IconServices,
  IconSettings,
  IconStaff,
  IconLogout,
  IconUserPlus,
} from './icons';

/**
 * Desktop navigation. Hidden below the mobile breakpoint, where BottomNav
 * takes over — so this component carries no drawer/hamburger state.
 *
 * Domain nouns come from ctx.labels (the vertical config) — "Staff" for a
 * salon, "Doctors" for a clinic. Everything else is plain-language UI copy
 * from lib/copy.ts. See 07-product-surfaces.md §1.1.
 */
export function Sidebar({
  tenantName,
  labels,
  role,
  whatsappLive,
}: {
  tenantName: string;
  labels: Record<string, string>;
  role?: MemberRole | null;
  /** Jira GRW-158 · GRW-165 — false until this business's WhatsApp number is switched on. */
  whatsappLive?: boolean;
}) {
  const pathname = usePathname();

  // Only routes that exist. Calendar is still in the design but has no page
  // yet — listing it here would be a link to a 404.
  const items: { href: string; label: string; icon: ReactNode; pill?: string | null }[] = [
    { href: '/', label: copy.nav.dashboard, icon: <IconDashboard /> },
    { href: '/appointments', label: labels.appointments ?? copy.nav.appointments, icon: <IconAppointments /> },
    { href: '/providers', label: labels.providers ?? copy.nav.staff, icon: <IconStaff /> },
    { href: '/services', label: labels.services ?? copy.nav.services, icon: <IconServices /> },
    { href: '/offers', label: copy.nav.offers, icon: <IconOffers /> },
    { href: '/customers', label: labels.customers ?? copy.nav.customers, icon: <IconUserPlus /> },
    // Reports is added; nothing is removed. The design's sidebar puts it in
    // Free times' slot, but a Reports mock is not a reason to demote a working
    // page out of the owner's reach (GRW-48 decision 2).
    { href: '/reports', label: copy.reports.navLabel, icon: <IconReports /> },
    { href: '/availability', label: copy.nav.availability, icon: <IconAnalytics /> },
    // GRW-165 — kept, never hidden: it is how an owner sees what their
    // customers will get, and it is the demo a salesperson shows. But while
    // WhatsApp is not live it is marked a preview, so nobody reads a working
    // simulator as a working channel.
    {
      href: '/try-whatsapp',
      label: whatsappLive ? copy.nav.tryWhatsApp : copy.whatsapp.navLabelDemo,
      icon: <IconChat />,
      pill: whatsappLive ? null : copy.whatsapp.previewPill,
    },
    { href: '/settings', label: copy.nav.settings, icon: <IconSettings /> },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-badge">{tenantName.charAt(0).toUpperCase()}</div>
        <div className="brand-name">{tenantName}</div>
      </div>
      <nav className="nav">
        {/* Jira GRW-66 · GRW-157 — a stylist is offered what they can use. The
            API is what refuses (GRW-156); this is about not wasting their time
            on eight links that 403. */}
        {visibleItems(items, role).map((item) => (
          <a key={item.href} href={item.href} className={pathname === item.href ? 'active' : ''}>
            {item.icon}
            {item.label}
            {item.pill ? <span className="nav-pill">{item.pill}</span> : null}
          </a>
        ))}
      </nav>
      {/* Jira GRW-66 · GRW-160 — outside `visibleItems`, deliberately. Every
          role can end their own session; a stylist on a shared salon device is
          the person who needs it most, and they see almost nothing above. */}
      <SignOutButton className="nav-signout">
        <IconLogout />
        {copy.nav.signOut}
      </SignOutButton>
    </aside>
  );
}
