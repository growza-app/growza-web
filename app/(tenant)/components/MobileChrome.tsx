'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { MemberRole } from '../lib/nav-policy';
import type { Lang } from '../lib/lang';
import { BottomNav } from './BottomNav';
import { useMobileNav } from './MobileNavProvider';
import { IconMenu } from './icons';

/**
 * The fixed mobile furniture: the hamburger toggle, the tab bar, and the
 * centre action's booking page.
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
 * Jira GRW-300 — the bar was tuned for 4 tabs + the centre action; a 5th
 * flat tab (Notifications, GRW-301) made every slot "very contracted"
 * (owner-reported). `More` and `Notifications` both moved into `Sidebar`,
 * reused as the mobile drawer admin's `AdminShell` already proved this
 * pattern with — same full nav a laptop gets, one tap away instead of a
 * fixed tab. The toggle renders here (fixed-position, so it doesn't matter
 * which subtree draws it) rather than inside every page's own header,
 * which would mean editing `PageHeader` AND `HomeHeader` for the same
 * button.
 */

/**
 * Full-screen edit forms with their own pinned primary button — the raised
 * centre action would sit on top of "Save changes". `/providers` (the roster)
 * keeps it; only `/providers/<id>` does not.
 */
const EDIT_ROUTE_RE = /^\/providers\/[^/]+$/;

/** `timezone` stays in the props contract (the layout always passes it) even though this component no longer reads it itself — GRW-297 moved the booking sheet it used to seed off this component entirely. */
export function MobileChrome({ labels, role, reportTabs, lang }: { labels: Record<string, string>; timezone: string; role?: MemberRole | null; reportTabs?: readonly string[]; lang?: Lang }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toggle } = useMobileNav();
  /**
   * A stylist cannot create a booking — `POST /api/v1/appointments` is not in
   * STAFF_ALLOWED (GRW-156). A receptionist CAN (GRW-169).
   *
   * Jira GRW-268 · GRW-273 — the centre action opens on "Walk-in now" for
   * everyone who can book, owner included. It used to open an owner on "For
   * later", on the theory that an owner's centre action is an appointment. In
   * a salon the person tapping it on a phone mostly has a customer in front
   * of them, and one tap on "For later" is still there when they do not.
   */
  const mayBook = role !== 'staff';
  const onCentre =
    mayBook && !EDIT_ROUTE_RE.test(pathname) ? () => router.push('/appointments/new?mode=now') : undefined;

  return (
    <>
      <button type="button" className="menu-toggle" aria-label="Menu" onClick={toggle}>
        <IconMenu />
      </button>
      <BottomNav role={role} labels={labels} reportTabs={reportTabs} lang={lang} onCentre={onCentre} />
    </>
  );
}
