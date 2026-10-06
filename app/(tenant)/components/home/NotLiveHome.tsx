'use client';

import { homeCopy } from '../../lib/home-copy';
import { setupCopy } from '../../lib/setup-copy';
import { canSee, type MemberRole } from '../../lib/nav-policy';
import type { Lang } from '../../lib/lang';
import { Card, HomeHeader, QuickTiles } from './parts';
import { IconServices, IconSettings, IconStaff } from '../icons';

/**
 * Jira GRW-556 — Home at a business that has not gone live yet, for every role.
 *
 * There is no day to show: no takings, no queue, nothing to mark done, and the API refuses every write outside
 * setup. So Home is the setup banner (above, in the shell) and the places setup happens — which for an owner is
 * three tiles, and for a receptionist or stylist is none, because setting up is not theirs. They get the sentence
 * instead: somebody is doing it, and their day appears when it is done.
 *
 * `page.tsx` renders this INSTEAD of the role's own Home, before loading anything. That ordering is the point: the
 * owner's Home used to gate itself at the bottom of `OwnerHome`, after the server had read the day and the browser
 * had read it again, and then drew these same three tiles.
 */
export function NotLiveHome({
  lang,
  labels,
  businessName,
  dateLabel,
  greetingPart,
  locationName,
  role,
  reportTabs,
}: {
  lang: Lang;
  labels: Record<string, string>;
  businessName: string;
  dateLabel: string;
  greetingPart: 'morning' | 'afternoon' | 'evening';
  locationName: string | null;
  role: MemberRole | null;
  reportTabs?: string[];
}) {
  const t = homeCopy(lang, labels);
  const c = setupCopy(lang);
  /*
   * The same `canSee` every nav surface asks, with `live` false — so these tiles and the tab bar cannot disagree
   * about what setup is. A role that may see none of them gets no empty card.
   */
  const links = [
    { href: '/providers', label: t.nav.staff, icon: <IconStaff />, tone: 'rose' },
    { href: '/services', label: t.nav.services, icon: <IconServices />, tone: 'green' },
    { href: '/settings', label: t.nav.settings, icon: <IconSettings />, tone: 'slate' },
  ].filter((l) => canSee(l.href, role, reportTabs, false));

  return (
    <>
      <HomeHeader
        t={t}
        title={t.greeting(greetingPart)}
        sub={role === 'owner' || role === 'manager' ? t.ownerSub(businessName, false) : businessName}
        businessName={businessName}
        locationName={locationName}
        dateLabel={dateLabel}
      />
      <div className="page-body hm-page">
        {links.length > 0 ? (
          <Card title={t.quickLinks}>
            <QuickTiles items={links} />
          </Card>
        ) : (
          <Card title={c.staffHomeTitle}>
            <p className="not-live-body">{c.staffHome}</p>
          </Card>
        )}
      </div>
    </>
  );
}
