'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NewVisitSheet, type VisitMode, type VisitPurpose } from '../../components/NewVisitSheet';
import type { QueueEntry } from '../../lib/home-types';
import type { Appointment } from '../../lib/api-types';
import { PayFlow } from './PayFlow';

/** Jira GRW-297 — `onClose` on a page presentation navigates back rather than unmounting an overlay. */
export function NewBookingClient({
  mode,
  purpose = 'visit',
  token,
  tokenGone = false,
  backTo,
  timezone,
  full = false,
  providerId = null,
  visit,
  visitGone = false,
}: {
  mode: VisitMode;
  purpose?: VisitPurpose;
  /** A waiting token being paid. */
  token?: QueueEntry;
  /** The address named a token that is no longer waiting: the page says so above the form. */
  tokenGone?: boolean;
  /** Where Close goes when it is not this purpose's usual screen (a token paid from Bookings). */
  backTo?: '/appointments';
  timezone: string;
  /** `?full=1` — the one-page form on a phone, for a sale the three-tap flow cannot write (a package, a price per line). */
  full?: boolean;
  /** The signed-in person's own chair, if they have one — the stylist the three-tap flow starts on. */
  providerId?: string | null;
  /** A booking being settled: its client, stylist and services are the answer to ①, and it is COMPLETED, not sold. */
  visit?: { appointment: Appointment; legs: Appointment[] };
  /** The address named a booking that is no longer settleable: the screen says so instead of taking the money twice. */
  visitGone?: boolean;
}) {
  const router = useRouter();
  /*
   * Owner, 2026-10-09 — Record payment on a phone is `PayFlow`, three screens; at a desk it is the one-page form.
   * The server cannot know the width, and the form fetches the menu the moment it mounts, so neither is drawn
   * until the browser has answered — one blank frame, not a form that flashes up and is replaced.
   */
  const [layout, setLayout] = useState<'unknown' | 'phone' | 'desk'>('unknown');
  const quick = purpose === 'payment' && !full;
  useEffect(() => {
    if (!quick) return;
    setLayout(window.matchMedia('(max-width: 860px)').matches ? 'phone' : 'desk');
  }, [quick]);

  /*
   * Settling a BOOKING is `PayFlow` at every width (owner, 2026-10-11).
   *
   * The width rule above is about ringing up a WALK-IN: a desk has room for the one-page form, a phone does
   * not. Settling a booking asks nothing that form is better at — the client, the stylist and the services
   * are already decided, and the till is an amount and a payment mode. Teaching the one-page form to settle
   * a booking would mean a second copy of the `checkout` branch inside a four-thousand-line component, which
   * is the drift this whole change exists to undo. So the booking takes the three-step flow and a desk gets
   * the same screen the phone does for this one job; ringing up a walk-in at a desk is untouched.
   *
   * This beats `?full=1` on purpose. That flag asks for the one-page form, and the one-page form writes a
   * counter SALE — which for a booking leaves it `confirmed` for ever beside a duplicate visit. An address
   * that asked for both would have to resolve one way, and this is the way that cannot write the wrong row.
   * What it costs: a per-line amount. The three-step flow takes one total and spreads it across the lines by
   * their list prices, so settling a two-service booking at a discount on ONE of them is approximated in
   * per-service reporting. Worth knowing before somebody reports it as a bug.
   */
  /*
   * `visitGone` counts too: the address ASKED to settle a booking, and the answer — that it is not open any
   * more — belongs on the screen that was asked for. Without it a stale link fell back to the one-page form
   * at desk width, which has nowhere to say so and looks like an ordinary sale waiting to be rung up.
   */
  const settlingBooking = purpose === 'payment' && (Boolean(visit) || visitGone);

  /*
   * Next customer on the payment done screen (owner, 2026-10-10 — the one-page form ends on the same screen as the
   * three-tap flow). A fresh form is a fresh mount; a token that was just paid is gone, so the address drops it.
   */
  const [run, setRun] = useState(0);
  const another = () => {
    setRun((n) => n + 1);
    if (token) router.replace(`/appointments/new?purpose=payment${full ? '&full=1' : ''}`);
  };

  if (quick && !settlingBooking && layout === 'unknown') return <div className="pf" aria-busy="true" />;
  if (settlingBooking || (quick && layout === 'phone')) {
    return <PayFlow token={token} tokenGone={tokenGone} visit={visit} visitGone={visitGone} providerId={providerId} timezone={timezone} backTo={backTo} />;
  }
  return (
    <NewVisitSheet
      key={run}
      onAnother={purpose === 'payment' ? another : undefined}
      presentation="page"
      mode={mode}
      purpose={purpose}
      token={token}
      tokenGone={tokenGone}
      timezone={timezone}
      onClose={() => router.push(backTo ?? (purpose === 'payment' ? '/' : '/appointments'))}
    />
  );
}
