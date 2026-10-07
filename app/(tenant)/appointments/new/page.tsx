import { redirect } from 'next/navigation';
import { guardLive } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import type { VisitMode } from '../../components/NewVisitSheet';
import type { QueueEntry } from '../../lib/home-types';
import { NewBookingClient } from './NewBookingClient';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { mayUse } from '../../lib/nav-policy';
import { isWritable } from '../../lib/read-only';

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
  searchParams: Promise<{ mode?: string; purpose?: string; token?: string; location?: string; from?: string }>;
}) {
  // Jira GRW-556 — this screen opens at go-live; before it, say so rather than draw what the API would refuse.
  await guardLive('/appointments/new');
  const params = await searchParams;
  const mode: VisitMode = params.mode === 'later' ? 'later' : 'now';
  // Owner, 2026-10-06 — Record payment on a phone is this page with `?purpose=payment`: one screen, ending in Mark done.
  const paying = params.purpose === 'payment';

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
  // Jira GRW-556 (follow-up) — and a business suspended for non-payment has nothing to book into: read-only.
  if (!mayUse(me.member?.role, 'visit.new', isWritable(me.tenant?.status))) {
    redirect('/appointments');
  }
  // Record payment is its own action: a role that may book but not take money is not offered the till.
  if (paying && !mayUse(me.member?.role, 'visit.recordPayment', isWritable(me.tenant?.status))) {
    redirect('/appointments/new');
  }

  /*
   * Owner, 2026-10-07 — paying a waiting token is this page too (`&token=…&location=…`), not the old overlay: the
   * token's client, branch and services filled in. A token that is no longer waiting (paid on another phone, left)
   * is not found: the page opens as a plain Record payment and SAYS so, or the desk takes the money a second time
   * for a visit that is already settled.
   */
  let token: QueueEntry | undefined;
  if (paying && params.token) {
    try {
      token = (await api.walkInQueue(params.location ?? null)).find((x) => x.id === params.token);
    } catch {
      token = undefined;
    }
  }
  const tokenGone = Boolean(paying && params.token && !token);

  return (
    <div className="page-body">
      <NewBookingClient mode={mode} purpose={paying ? 'payment' : 'visit'} token={token} tokenGone={tokenGone} backTo={params.from === 'bookings' ? '/appointments' : undefined} timezone={me.tenant?.timezone ?? 'Asia/Kolkata'} />
    </div>
  );
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ purpose?: string }> }) {
  return screenTitle((await searchParams).purpose === 'payment' ? 'Record payment' : 'New booking');
}
