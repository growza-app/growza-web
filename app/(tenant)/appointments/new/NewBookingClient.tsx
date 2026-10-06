'use client';

import { useRouter } from 'next/navigation';
import { NewVisitSheet, type VisitMode, type VisitPurpose } from '../../components/NewVisitSheet';

/** Jira GRW-297 — `onClose` on a page presentation navigates back rather than unmounting an overlay. */
export function NewBookingClient({ mode, purpose = 'visit', timezone }: { mode: VisitMode; purpose?: VisitPurpose; timezone: string }) {
  const router = useRouter();
  return (
    <NewVisitSheet
      presentation="page"
      mode={mode}
      purpose={purpose}
      timezone={timezone}
      onClose={() => router.push(purpose === 'payment' ? '/' : '/appointments')}
    />
  );
}
