'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useVisibleInterval } from './useVisibleInterval';

/**
 * Every page here is `force-dynamic` — fetched fresh on navigation, but never
 * again after that. A booking made from WhatsApp (a different device
 * entirely) has no way to tell an already-open dashboard tab anything
 * changed, so without this an owner sees a stale "Today" screen until they
 * manually reload.
 */
const POLL_MS = 15_000;

/**
 * Routes that show what is happening *now*, and are the only ones that poll.
 *
 * `router.refresh()` re-renders the whole route on the server, so its cost is
 * whatever that page costs — 27 queries for one refresh of the Reports
 * Clients tab, four times a minute, or about 6,500 an hour for one owner who
 * left a tab open. A revenue chart covering three months does not change in
 * fifteen seconds, so that was paying a live-data price for data that is not
 * live.
 *
 * The rule is what the screen is *for*, not how heavy it is: a booking
 * arriving right now has to appear on today's schedule without a reload, and
 * has no business redrawing a quarterly report. Everything else — Reports,
 * Services, Offers, Clients, Settings — refetches when the owner navigates to
 * it or comes back to the tab, which is when they would notice anyway.
 */
const LIVE_ROUTES = ['/', '/appointments', '/availability'];

/**
 * Whether this route keeps a standing timer.
 *
 * Exported so it can be tested directly: whether a screen polls is a cost
 * decision, and a browser cannot prove it either way — an automation pane
 * reports `hidden`, which suppresses the poll, and a real backgrounded tab
 * throttles the timer regardless.
 */
export function shouldPoll(pathname: string): boolean {
  return LIVE_ROUTES.includes(pathname);
}

export function LiveRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const isLive = shouldPoll(pathname);

  // Coming back to the tab refreshes wherever you are: you have been away,
  // and the first thing you look at should be current. That is one refetch
  // on a deliberate action, not a standing timer. The timer itself only runs
  // where the screen is about right now.
  useVisibleInterval(() => router.refresh(), isLive ? POLL_MS : null);

  return null;
}
