import { screenTitle } from '../lib/page-title';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { homeCopy } from '../lib/home-copy';
import { serverLang } from '../lib/lang';
import { api } from '../lib/api';
import { copy } from '../lib/copy';
import { visibleItems, type MemberRole } from '../lib/nav-policy';
import { PageHeader } from '../components/PageHeader';
import { IconAnalytics, IconChat, IconOffers, IconPackages, IconChevronRight, IconLogout, IconReports, IconServices, IconSettings, IconStaff } from '../components/icons';
import { SignOutButton } from '../components/SignOutButton';

export const dynamic = 'force-dynamic';

/**
 * The mobile tab bar carries only the four frequent destinations; everything
 * rarer lives here. On desktop the sidebar already lists all of these, so
 * this page is effectively mobile-only — but it stays reachable either way
 * rather than being hidden behind a breakpoint.
 */
export default async function MorePage() {
  const ta = await getTranslations('attendance');
  const tn = await getTranslations('nouns');
  let labels: Record<string, string> = {};
  // Jira GRW-66 · GRW-157 — this menu is filtered by the same policy the
  // sidebar and the tab bar use. Three copies of the list is how a stylist
  // reaches through a menu what the sidebar was careful to hide.
  let role: MemberRole | null = null;
  /** Jira GRW-158 · GRW-165 — false until this business's WhatsApp is switched on, and false when the API cannot say. */
  let whatsappLive = false;
  /** Jira GRW-266 · GRW-271 — off in production, and off when the API cannot say. */
  let whatsappDemo = false;
  /**
   * Jira GRW-409 — the Reports tabs this salon opened to this role (GRW-197). The sidebar passed them and this
   * menu did not, so a receptionist granted a tab was offered Reports in one menu and not in the other.
   */
  let reportTabs: string[] | undefined;
  try {
    const me = await api.me();
    labels = me.labels;
    role = (me.member?.role as MemberRole | undefined) ?? null;
    whatsappLive = me.whatsapp?.booking ?? false;
    whatsappDemo = me.whatsapp?.demo ?? false;
    reportTabs = me.reportTabs;
  } catch {
    // Falls back to the plain-language defaults below, and to the owner nav —
    // a degraded API must not hide the product from the person who owns it.
  }

  // Jira GRW-222 — Offers left the tab bar for the raised centre action, so it
  // is listed here now. Calendar has no page yet — listing it would be a dead link.
  // The same words the sidebar and the tab bar use, in the owner's language, so the three cannot disagree.
  const lang = await serverLang();
  const nav = homeCopy(lang, labels);

  const items: { href: string; label: string; icon: ReactNode; pill?: string | null }[] = [
    // GRW-170 — the register lives here on a phone. The bottom bar is five
    // fixed slots and a sixth would break it, so Attendance rides the menu
    // rather than displacing a tab everybody uses.
    { href: '/attendance', label: ta('title'), icon: <IconStaff /> },
    { href: '/offers', label: nav.nav.offers, icon: <IconOffers /> },
    { href: '/providers', label: nav.nav.staff, icon: <IconStaff /> },
    { href: '/services', label: nav.nav.services, icon: <IconServices /> },
    // Jira GRW-438 — the bottom bar's five slots do not change, so Packages rides this menu on a phone.
    { href: '/packages', label: nav.nav.packages, icon: <IconPackages /> },
    // The design's mobile tab bar puts Reports in Offers' slot. The tab bar's
    // composition is its own product decision, so Reports arrives here instead
    // and the four frequent destinations keep their places (GRW-48 decision 2).
    { href: '/reports', label: nav.nav.reports, icon: <IconReports /> },
    { href: '/availability', label: nav.nav.freeTimes, icon: <IconAnalytics /> },
    // GRW-165 — marked a preview while WhatsApp is not live, exactly as the
    // sidebar marks it. Three navs that disagree about what is real is the
    // failure this list was consolidated to prevent. Jira GRW-266 · GRW-271 — and left
    // out in production, exactly as the sidebar leaves it out.
    ...(whatsappDemo
      ? [
          {
            href: '/try-whatsapp',
            label: whatsappLive && lang === 'en' ? copy.nav.tryWhatsApp : nav.nav.whatsapp,
            icon: <IconChat />,
            pill: whatsappLive ? null : nav.nav.demo,
          },
        ]
      : []),
    { href: '/settings', label: nav.nav.settings, icon: <IconSettings /> },
  ];

  return (
    <>
      <PageHeader title={tn('moreTitle')} />
      <div className="page-body">
        <div className="menu-list">
          {visibleItems(items, role, reportTabs).map((item) => (
            <a className="menu-row" key={item.href} href={item.href}>
              {item.icon}
              {item.label}
              {item.pill ? <span className="menu-row-pill">{item.pill}</span> : null}
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
            {nav.nav.signOut}
          </SignOutButton>
        </div>
      </div>
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('More');
