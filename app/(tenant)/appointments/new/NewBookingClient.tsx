'use client';

import { useRouter } from 'next/navigation';
import { NewVisitSheet, type VisitMode } from '../../components/NewVisitSheet';

/** Jira GRW-297 — `onClose` on a page presentation navigates back rather than unmounting an overlay. */
export function NewBookingClient({ mode, timezone }: { mode: VisitMode; timezone: string }) {
  const router = useRouter();
  return (
    <NewVisitSheet
      presentation="page"
      mode={mode}
      purpose="visit"
      timezone={timezone}
      onClose={() => router.push('/appointments')}
    />
  );
}
