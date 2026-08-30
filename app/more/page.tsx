import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { PageHeader } from '../components/PageHeader';
import { IconAnalytics, IconChat, IconChevronRight, IconReports, IconServices, IconSettings, IconStaff } from '../components/icons';

export const dynamic = 'force-dynamic';

/**
 * The mobile tab bar carries only the four frequent destinations; everything
 * rarer lives here. On desktop the sidebar already lists all of these, so
 * this page is effectively mobile-only — but it stays reachable either way
 * rather than being hidden behind a breakpoint.
 */
export default async function MorePage() {
  let labels: Record<string, string> = {};
  try {
    labels = (await api.me()).labels;
  } catch {
    // Falls back to the plain-language defaults below.
  }

  // Offers is a tab of its own, so it is deliberately not repeated here.
  // Calendar has no page yet — listing it would be a dead link.
  const items = [
    { href: '/providers', label: labels.providers ?? copy.nav.staff, icon: <IconStaff /> },
    { href: '/services', label: labels.services ?? copy.nav.services, icon: <IconServices /> },
    // The design's mobile tab bar puts Reports in Offers' slot. The tab bar's
    // composition is its own product decision, so Reports arrives here instead
    // and the four frequent destinations keep their places (GRW-48 decision 2).
    { href: '/reports', label: copy.reports.navLabel, icon: <IconReports /> },
    { href: '/availability', label: copy.nav.availability, icon: <IconAnalytics /> },
    { href: '/try-whatsapp', label: copy.nav.tryWhatsApp, icon: <IconChat /> },
    { href: '/settings', label: copy.nav.settings, icon: <IconSettings /> },
  ];

  return (
    <>
      <PageHeader title={copy.nav.more} />
      <div className="page-body">
        <div className="menu-list">
          {items.map((item) => (
            <a className="menu-row" key={item.href} href={item.href}>
              {item.icon}
              {item.label}
              <span className="chev">
                <IconChevronRight />
              </span>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
