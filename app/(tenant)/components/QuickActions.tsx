'use client';

import { useState } from 'react';
import { NewVisitSheet, type VisitMode } from './NewVisitSheet';
import { IconAnalytics, IconPlus, IconUser, IconUserPlus } from './icons';

/**
 * Desktop-only: the floating "+" button covers this same ground on mobile
 * (walk-in / book for later), but has no desktop equivalent — without this,
 * starting a booking from Home meant a detour through the sidebar. Every
 * action here is vertical-agnostic (a salon walk-in and a garage walk-in are
 * the same underlying flow) and links to a route that actually exists —
 * "View reports" points at Bookings, the same placeholder the "View report"
 * glance row already uses, since there's no dedicated reports page yet.
 *
 * ## Why this became a client component (Jira GRW-199)
 *
 * Both booking actions used to be `<a href="/availability?intent=book">` — the
 * same link, twice, one labelled "New booking" and one "Add walk-in", landing
 * on the same slot grid that could do neither well.
 *
 * When the FAB moved to the new sheet, these did not, because Home is a server
 * component and a sheet needs state. The result was worse than before: the same
 * salon had two different booking flows depending on whether the receptionist
 * reached for the corner button or the Home card. Splitting these four buttons
 * into their own client island is the smallest thing that keeps one flow.
 */
export function QuickActions({ timezone }: { timezone: string }) {
  const [sheet, setSheet] = useState<VisitMode | null>(null);

  return (
    <>
      <section className="rail-card rail-actions">
        <h3>Quick actions</h3>
        <button type="button" className="quick-action quick-action-primary" onClick={() => setSheet('later')}>
          <IconPlus />
          New booking
        </button>
        <button type="button" className="quick-action" onClick={() => setSheet('now')}>
          <IconUserPlus />
          Add walk-in
        </button>
        <a className="quick-action" href="/customers?add=1">
          <IconUser />
          New client
        </a>
        <a className="quick-action" href="/appointments">
          <IconAnalytics />
          View reports
        </a>
      </section>

      {sheet && <NewVisitSheet mode={sheet} timezone={timezone} onClose={() => setSheet(null)} />}
    </>
  );
}
