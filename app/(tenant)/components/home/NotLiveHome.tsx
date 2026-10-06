'use client';

import { homeCopy } from '../../lib/home-copy';
import { setupCopy } from '../../lib/setup-copy';
import type { Lang } from '../../lib/lang';
import { Card, HomeHeader } from './parts';

/**
 * Jira GRW-556 — Home for a receptionist or stylist at a business that has not gone live yet.
 *
 * The desk's board and a stylist's day have nothing in them and nothing they could do (the API refuses every write
 * outside setup), and setting up is the owner's: so this says that, and nothing else. The owner's own Home keeps
 * its quick links — see OwnerHome.
 */
export function NotLiveHome({
  lang,
  labels,
  businessName,
  dateLabel,
  greetingPart,
  locationName,
}: {
  lang: Lang;
  labels: Record<string, string>;
  businessName: string;
  dateLabel: string;
  greetingPart: 'morning' | 'afternoon' | 'evening';
  locationName: string | null;
}) {
  const t = homeCopy(lang, labels);
  return (
    <>
      <HomeHeader t={t} title={t.greeting(greetingPart)} sub={businessName} businessName={businessName} locationName={locationName} dateLabel={dateLabel} />
      <div className="page-body hm-page">
        <Card title={setupCopy(lang).staffHomeTitle}>
          <p className="not-live-body">{setupCopy(lang).staffHome}</p>
        </Card>
      </div>
    </>
  );
}
