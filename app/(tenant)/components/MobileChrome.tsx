'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { mayUse, type MemberRole } from '../lib/nav-policy';
import type { Lang } from '../lib/lang';
import { BottomNav } from './BottomNav';
import { NewVisitSheet } from './NewVisitSheet';

/**
 * The fixed mobile furniture: the tab bar and the sheet the plus opens.
 *
 * Jira GRW-222 — the floating "+" button this used to render is gone; its job
 * moved into the bar (see BottomNav). The five-screen NO_FAB list went with it,
 * because it existed only to stop a floating button covering a row, and an
 * action inside the bar covers nothing.
 *
 * Jira GRW-297 — the centre action used to mount `NewVisitSheet` as an
 * overlay here; it now navigates to the New Booking page instead
 * (`/appointments/new`), which is `NewVisitSheet` again underneath, just
 * routed rather than popped up.
 *
 * Jira GRW-306 — the hamburger this used to draw is gone. It was a
 * fixed-position button over every screen, so each header had to leave 58px
 * clear for it and two did not (Reports' title lost its first letter). The
 * screens the tab bar has no room for are now behind the avatar (`AccountMenu`).
 */

/**
 * Jira GRW-508 — the floating New booking is on Home, Bookings and Clients, and nowhere else.
 *
 * It used to be "everywhere except" a list that kept growing (a staff edit screen, then Notifications in
 * GRW-507): every new screen got a button over its content until somebody noticed. An allow-list turns
 * that round — a new screen has none until it is added here. Exact paths only: `/appointments/new` is the
 * booking page itself and `/customers/<id>` is one client, and neither wants a "new booking" over it.
 */
const PLUS_ROUTE_RE = /^\/(appointments|customers)?\/?$/;

/** `timezone` seeds the booking sheet the plus opens (Jira GRW-512; GRW-297 had moved that sheet to a page and this stopped reading it). */
export function MobileChrome({ labels, role, reportTabs, lang, timezone }: { labels: Record<string, string>; timezone: string; role?: MemberRole | null; reportTabs?: readonly string[]; lang?: Lang }) {
  const pathname = usePathname();
  const router = useRouter();
  // Jira GRW-512 — the plus opens New booking as a sheet over the current screen, like the Day summary.
  const [bookingOpen, setBookingOpen] = useState(false);
  /**
   * A stylist cannot create a booking — `POST /api/v1/walk-ins` and `/bookings`
   * are not in STAFF_ALLOWED (GRW-156). A receptionist CAN (GRW-169). Jira
   * GRW-409 — asked of the shared rule (`mayUse`) rather than `role !== 'staff'`,
   * so the next limited role is not handed a button by being "not a stylist".
   *
   * Jira GRW-268 · GRW-273 — the centre action opens on "Walk-in now" for
   * everyone who can book, owner included. It used to open an owner on "For
   * later", on the theory that an owner's centre action is an appointment. In
   * a salon the person tapping it on a phone mostly has a customer in front
   * of them, and one tap on "For later" is still there when they do not.
   */
  const mayBook = mayUse(role, 'visit.new');
  const onCentre =
    mayBook && PLUS_ROUTE_RE.test(pathname) ? () => setBookingOpen(true) : undefined;

  return (
    <>
      <BottomNav role={role} labels={labels} reportTabs={reportTabs} lang={lang} onCentre={onCentre} />
      {/* Opens on "Walk-in now" (GRW-268) — For later is one tap inside. Closing, or finishing a booking,
          unmounts it and refreshes what is behind so the new booking is in the list. The route
          `/appointments/new` stays for the links that still go there. */}
      {bookingOpen ? (
        <NewVisitSheet
          mode="now"
          purpose="visit"
          timezone={timezone}
          onClose={() => {
            setBookingOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
