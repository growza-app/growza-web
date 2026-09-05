import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { visibleItems, type MemberRole } from '../lib/nav-policy';
import { PageHeader } from '../components/PageHeader';
import { IconAnalytics, IconChat, IconChevronRight, IconLogout, IconReports, IconServices, IconSettings, IconStaff } from '../components/icons';
import { SignOutButton } from '../components/SignOutButton';

export const dynamic = 'force-dynamic';

/**
 * The mobile tab bar carries only the four frequent destinations; everything
 * rarer lives here. On desktop the sidebar already lists all of these, so
 * this page is effectively mobile-only — but it stays reachable either way
 * rather than being hidden behind a breakpoint.
 */
export default async function MorePage() {
  let labels: Record<string, string> = {};
  // Jira GRW-66 · GRW-157 — this menu is filtered by the same policy the
  // sidebar and the tab bar use. Three copies of the list is how a stylist
  // reaches through a menu what the sidebar was careful to hide.
  let role: MemberRole | null = null;
  try {
    const me = await api.me();
    labels = me.labels;
    role = (me.member?.role as MemberRole | undefined) ?? null;
  } catch {
    // Falls back to the plain-language defaults below, and to the owner nav —
    // a degraded API must not hide the product from the person who owns it.
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
          {visibleItems(items, role).map((item) => (
            <a className="menu-row" key={item.href} href={item.href}>
              {item.icon}
              {item.label}
              <span className="chev">
                <IconChevronRight />
              </span>
            </a>
          ))}
          {/* Jira GRW-66 · GRW-160 — outside the policy filter, on purpose.
              Every role can end their own session. This is also what makes
              `/more` worth showing a stylist again: GRW-158 removed it because
              it rendered empty for them, and this is the row it was missing. */}
          <SignOutButton className="menu-row menu-row-action">
            <IconLogout />
            {copy.nav.signOut}
          </SignOutButton>
        </div>
      </div>
    </>
  );
}
