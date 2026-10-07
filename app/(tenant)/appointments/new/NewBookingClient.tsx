'use client';

import { useRouter } from 'next/navigation';
import { NewVisitSheet, type VisitMode, type VisitPurpose } from '../../components/NewVisitSheet';
import type { QueueEntry } from '../../lib/home-types';

/** Jira GRW-297 — `onClose` on a page presentation navigates back rather than unmounting an overlay. */
export function NewBookingClient({
  mode,
  purpose = 'visit',
  token,
  tokenGone = false,
  backTo,
  timezone,
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
}) {
  const router = useRouter();
  return (
    <NewVisitSheet
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
