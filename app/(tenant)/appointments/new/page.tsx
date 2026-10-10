import { redirect } from 'next/navigation';
import { guardLive } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import type { Appointment } from '../../lib/api-types';
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
  searchParams: Promise<{ mode?: string; purpose?: string; token?: string; location?: string; from?: string; full?: string; visit?: string; on?: string }>;
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

  /*
   * Owner, 2026-10-10 — settling a BOOKING is this page too (`&visit=<id>&on=<date>`), not a till of its own.
   *
   * Taking money is one job and the desk should meet one screen doing it, whether the person walked in or was
   * booked. What differs is underneath: a walk-in's payment CREATES the visit (a counter sale), a booking's
   * payment COMPLETES rows that already exist (`POST /appointments/:id/checkout`). Writing a sale for a booking
   * would leave the booking `confirmed` for ever beside a second visit for the same work.
   *
   * `on` is the booking's own day, carried by whoever opened this, because there is no read for one appointment
   * by id — the day's list is, and the visit's other legs come back with it. Without it a booking for next
   * Tuesday could not be found at all.
   */
  let visit: { appointment: Appointment; legs: Appointment[] } | undefined;
  if (paying && params.visit && params.on) {
    try {
      const day = await api.appointments(params.on, params.on);
      /*
       * Still settleable, or not at all.
       *
       * `confirmed` is the only state with money still to take: a `completed` row has been paid, and a
       * cancelled or no-show one never will be. Matching on the id alone found a settled booking perfectly
       * well and opened the flow on it — a stale "Mark as done" link, or a back button after paying, and the
       * salon takes the money a second time. Falling through to `visitGone` is what says so.
       */
      const one = day.find((a) => a.id === params.visit && a.status === 'confirmed');
      // The combo's other still-booked legs settle in the same payment, as the till they replace did.
      const legs = one?.bookingGroupId
        ? day.filter((a) => a.bookingGroupId === one.bookingGroupId && a.id !== one.id && a.status === 'confirmed')
        : [];
      if (one) visit = { appointment: one, legs };
    } catch {
      visit = undefined;
    }
  }
  // Named a booking that is not there (settled on another phone, moved, cancelled): say so rather than take the money twice.
  const visitGone = Boolean(paying && params.visit && !visit);

  return (
    <div className="page-body">
      {/* Owner, 2026-10-09 — on a phone, Record payment is three screens (`PayFlow`); `?full=1` keeps the one-page form there. */}
      <NewBookingClient
        mode={mode}
        purpose={paying ? 'payment' : 'visit'}
        token={token}
        tokenGone={tokenGone}
        visit={visit}
        visitGone={visitGone}
        backTo={params.from === 'bookings' ? '/appointments' : undefined}
        timezone={me.tenant?.timezone ?? 'Asia/Kolkata'}
        full={params.full === '1'}
        providerId={me.member?.providerId ?? null}
      />
    </div>
  );
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ purpose?: string }> }) {
  return screenTitle((await searchParams).purpose === 'payment' ? 'Record payment' : 'New booking');
}
