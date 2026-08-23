'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Every page here is `force-dynamic` — fetched fresh on navigation, but never again after that. A booking made from WhatsApp (a different device entirely) has no way to tell an already-open dashboard tab anything changed, so without this an owner sees a stale "Today" screen until they manually reload. */
const POLL_MS = 15_000;

/**
 * Keeps the dashboard live without a manual reload. `router.refresh()`
 * re-fetches every server component on the current route in place — no full
 * page reload, no lost scroll position or open modal — so this is cheap
 * enough to run on a timer. Paused while the tab is hidden (a backgrounded
 * tab has no reason to keep polling), and fires once immediately on
 * refocus so switching back from WhatsApp shows the new booking right away
 * instead of waiting out the rest of the interval.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const id = setInterval(refreshIfVisible, POLL_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [router]);

  return null;
}
