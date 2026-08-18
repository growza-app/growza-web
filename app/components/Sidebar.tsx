'use client';

import { usePathname } from 'next/navigation';
import { copy } from '../lib/copy';
import {
  IconAnalytics,
  IconAppointments,
  IconCalendar,
  IconChat,
  IconDashboard,
  IconServices,
  IconSettings,
  IconStaff,
} from './icons';

/**
 * Domain nouns come from ctx.labels (the vertical config) — "Staff" for a
 * salon, "Doctors" for a clinic. Everything else is plain-language UI copy
 * from lib/copy.ts. See 07-product-surfaces.md §1.1.
 */
export function Sidebar({ tenantName, labels }: { tenantName: string; labels: Record<string, string> }) {
  const pathname = usePathname();

  const items = [
    { href: '/', label: copy.nav.dashboard, icon: <IconDashboard /> },
    { href: '/calendar', label: copy.nav.calendar, icon: <IconCalendar /> },
    { href: '/appointments', label: labels.appointments ?? copy.nav.appointments, icon: <IconAppointments /> },
    { href: '/providers', label: labels.providers ?? copy.nav.staff, icon: <IconStaff /> },
    { href: '/services', label: labels.services ?? copy.nav.services, icon: <IconServices /> },
    { href: '/availability', label: copy.nav.availability, icon: <IconAnalytics /> },
    { href: '/try-whatsapp', label: copy.nav.tryWhatsApp, icon: <IconChat /> },
    { href: '/settings', label: copy.nav.settings, icon: <IconSettings /> },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-badge">{tenantName.charAt(0).toUpperCase()}</div>
        <div className="brand-name">{tenantName}</div>
      </div>
      <nav className="nav">
        {items.map((item) => (
          <a key={item.href} href={item.href} className={pathname === item.href ? 'active' : ''}>
            {item.icon}
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
