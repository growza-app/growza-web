'use client';

import { NotificationBell } from './NotificationBell';
import { useLive } from './SessionProvider';
import { useControlsInSidebar } from './sidebar-controls';

/**
 * Owner, 2026-11-20 — on a laptop the bell sits in the page head's top row, beside the screen's own actions ("next to
 * New order"), not in the sidebar with the business. Drawn only once the sidebar has taken the header's controls
 * (`sidebar-controls.ts`); before that, and on a phone, the header's own bell is the one — never two.
 */
export function PageHeadBell() {
  const live = useLive();
  const inSidebar = useControlsInSidebar();
  if (!live || !inSidebar) return null;
  return (
    <span className="page-head-bell">
      <NotificationBell />
    </span>
  );
}
