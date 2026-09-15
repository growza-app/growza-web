'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import type { MemberRole } from '../lib/nav-policy';
import type { Lang } from '../lib/lang';
import { BottomNav } from './BottomNav';
import { NewVisitSheet, type VisitMode } from './NewVisitSheet';

/**
 * The fixed mobile furniture: the tab bar, and the booking sheet its centre
 * action opens.
 *
 * Jira GRW-222 — the floating "+" button this used to render is gone; its job
 * moved into the bar (see BottomNav). The five-screen NO_FAB list went with it,
 * because it existed only to stop a floating button covering a row, and an
 * action inside the bar covers nothing.
 */

/**
 * Full-screen edit forms with their own pinned primary button — the raised
 * centre action would sit on top of "Save changes". `/providers` (the roster)
 * keeps it; only `/providers/<id>` does not.
 */
const EDIT_ROUTE_RE = /^\/providers\/[^/]+$/;

export function MobileChrome({ labels, timezone, role, reportTabs, lang }: { labels: Record<string, string>; timezone: string; role?: MemberRole | null; reportTabs?: readonly string[]; lang?: Lang }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<VisitMode | null>(null);
  /**
   * A stylist cannot create a booking — `POST /api/v1/appointments` is not in
   * STAFF_ALLOWED (GRW-156). A receptionist CAN (GRW-169).
   *
   * Jira GRW-268 · GRW-273 — the sheet opens on "Walk-in now" for everyone who
   * can book, owner included. It used to open an owner on "For later", on the
   * theory that an owner's centre action is an appointment. In a salon the
   * person tapping it on a phone mostly has a customer in front of them, and
   * one tap on "For later" is still there when they do not.
   */
  const mayBook = role !== 'staff';
  const onCentre = mayBook && !EDIT_ROUTE_RE.test(pathname) ? () => setSheet('now') : undefined;

  return (
    <>
      {sheet && <NewVisitSheet mode={sheet} timezone={timezone} onClose={() => setSheet(null)} />}
      <BottomNav role={role} labels={labels} reportTabs={reportTabs} lang={lang} onCentre={onCentre} />
    </>
  );
}
