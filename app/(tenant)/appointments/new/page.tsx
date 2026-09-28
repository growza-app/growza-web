import { redirect } from 'next/navigation';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import type { VisitMode } from '../../components/NewVisitSheet';
import { NewBookingClient } from './NewBookingClient';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { mayUse } from '../../lib/nav-policy';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-297 — New Booking's own page, not a pop-up over one: the same
 * stages `NewVisitSheet` has always run ("who is this" → "what are they
 * having" → "when", `later` only), just no longer a fixed-position sheet.
 * `purpose: 'payment'` (Record payment) is unchanged and still an overlay —
 * this route is `purpose: 'visit'` only.
 */
export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const mode: VisitMode = params.mode === 'later' ? 'later' : 'now';

  let me;
  try {
    me = await api.me();
  } catch (error) {
    return (
      <div className="page-body">
        <LoadErrorBanner kind={loadErrorKind(error)} />
      </div>
    );
  }

  /*
   * FR-05 — a stylist has no route to create a booking at all
   * (`POST /api/v1/appointments`/`/bookings`/`/walk-ins` are not
   * STAFF_ALLOWED, src/api/security/tenant-policy.ts); the page must not
   * render the form for them either, matching `mayBook` on the bar that
   * used to be the only door to this flow.
   */
  // Jira GRW-409 — asked of the shared rule the centre button asks, so the page and the button cannot disagree.
  if (!mayUse(me.member?.role, 'visit.new')) {
    redirect('/appointments');
  }

  return (
    <div className="page-body">
      <NewBookingClient mode={mode} timezone={me.tenant?.timezone ?? 'Asia/Kolkata'} />
    </div>
  );
}

export const metadata = screenTitle('New booking');
