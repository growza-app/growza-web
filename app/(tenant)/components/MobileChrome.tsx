'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import type { MemberRole } from '../lib/nav-policy';
import { BottomNav } from './BottomNav';
import { IconPlus } from './icons';
import { NewVisitSheet, type VisitMode } from './NewVisitSheet';

/**
 * The fixed mobile furniture: tab bar everywhere, plus the floating booking
 * button on the screens where creating a booking is a plausible next move.
 * Hidden inside the booking flow itself (you're already there) and on
 * search, where it would sit on top of results.
 */
// /offers has its own primary "+ Create a new combo" action — a second,
// functionally-unrelated "New booking" FAB floating on top of it is
// confusing, not helpful, the same reasoning that excludes /search.
// /attendance is the same case as /offers: a full-width row-per-person form
// with its own primary action ("Mark all present"), and at 390px the FAB sits
// directly on top of the first row's Out-time control (GRW-170).
const NO_FAB = ['/availability', '/search', '/try-whatsapp', '/offers', '/attendance'];

/**
 * Full-screen edit forms with their own pinned primary button — the FAB would
 * float directly on top of "Save changes". Matched as a pattern rather than a
 * NO_FAB prefix because `/providers` (the roster) SHOULD keep the FAB; only
 * `/providers/<id>` should not.
 */
const EDIT_ROUTE_RE = /^\/providers\/[^/]+$/;

export function MobileChrome({ labels, timezone, role, reportTabs }: { labels: Record<string, string>; timezone: string; role?: MemberRole | null; reportTabs?: readonly string[] }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<VisitMode | null>(null);
  /**
   * A stylist cannot create a booking — `POST /api/v1/appointments` is not in
   * STAFF_ALLOWED (GRW-156) — so the FAB opened a menu whose every destination
   * refused them. Found while checking the attendance screen; the role was
   * already being passed here for the tab bar, so the fix is to read it.
   *
   * A receptionist CAN book (GRW-169), and keeps it.
   */
  const mayBook = role !== 'staff';
  const showFab = mayBook && !NO_FAB.some((p) => pathname.startsWith(p)) && !EDIT_ROUTE_RE.test(pathname);

  return (
    <>
      {/*
        Jira GRW-199 — the pop-up menu is gone, and the reason is not visual.
        It existed to ask which of two screens you wanted. There is now ONE
        screen with two modes, so the question it asks has no answer the sheet
        cannot ask better — and it asked it with three nested shapes per item
        (a white card holding a dark pill holding a white circle), stacked
        above a third floating button.
        Apple has no floating action button at all; the nearest thing in the
        current language is a single action attached to the tab bar, with the
        choice made inside the surface it opens. So: one tap fewer, one whole
        overlay fewer, and the mode toggle lives where the rest of the decision
        already is.
      */}
      {showFab && (
        <button type="button" className="fab" aria-label="New booking" onClick={() => setSheet('now')}>
          <IconPlus />
        </button>
      )}

      {sheet && <NewVisitSheet mode={sheet} timezone={timezone} onClose={() => setSheet(null)} />}

      <BottomNav role={role} labels={labels} reportTabs={reportTabs} />
    </>
  );
}
