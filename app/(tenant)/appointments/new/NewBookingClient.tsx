'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NewVisitSheet, type VisitMode, type VisitPurpose } from '../../components/NewVisitSheet';
import type { QueueEntry } from '../../lib/home-types';
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
   * Next customer on the payment done screen (owner, 2026-10-10 — the one-page form ends on the same screen as the
   * three-tap flow). A fresh form is a fresh mount; a token that was just paid is gone, so the address drops it.
   */
  const [run, setRun] = useState(0);
  const another = () => {
    setRun((n) => n + 1);
    if (token) router.replace(`/appointments/new?purpose=payment${full ? '&full=1' : ''}`);
  };

  if (quick && layout === 'unknown') return <div className="pf" aria-busy="true" />;
  if (quick && layout === 'phone') {
    return <PayFlow token={token} tokenGone={tokenGone} providerId={providerId} timezone={timezone} backTo={backTo} />;
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
