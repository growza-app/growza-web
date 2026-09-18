'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { useVisibleInterval, type VisibleReason } from './useVisibleInterval';

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

/** Every this-many ticks, redraw regardless: a minute, for time-driven state no change signal announces. */
export const FORCE_EVERY_TICKS = 4;

/**
 * Jira GRW-310 — what a timer tick does.
 *
 * It used to `router.refresh()` every time: a full server render, six or seven
 * API calls, four times a minute, whether or not anything had moved. It now asks
 * `/api/v1/live-version` first (one query) and redraws only if the answer changed
 * since the last one. Pure, so the decision can be tested without a browser.
 *
 * - `refresh` — redraw now.
 * - `baseline` — the version to compare the NEXT tick against (null: none yet).
 *
 * A forced tick (every `FORCE_EVERY_TICKS`) redraws regardless, which is what keeps
 * clock-driven state ("running late", "next up") moving even when no row has
 * changed; it also re-baselines. A failed check (null) redraws nothing and keeps the
 * old baseline: a rate-limited or offline tab must go quiet, not hammer.
 */
export function decideTick(input: { tick: number; version: string | null; baseline: string | null }): { refresh: boolean; baseline: string | null } {
  const forced = input.tick % FORCE_EVERY_TICKS === 0;
  if (forced) return { refresh: true, baseline: input.version ?? input.baseline };
  if (input.version === null) return { refresh: false, baseline: input.baseline };
  if (input.baseline === null) return { refresh: false, baseline: input.version };
  return { refresh: input.version !== input.baseline, baseline: input.version };
}

export function LiveRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const isLive = shouldPoll(pathname);
  const tick = useRef(0);
  const baseline = useRef<string | null>(null);
  const busy = useRef(false);

  // A different screen is a different page: start its count and its baseline over.
  useEffect(() => {
    tick.current = 0;
    baseline.current = null;
  }, [pathname]);

  // Coming back to the tab refreshes wherever you are: you have been away,
  // and the first thing you look at should be current. That is one refetch
  // on a deliberate action, not a standing timer. The timer itself only runs
  // where the screen is about right now.
  useVisibleInterval(async (reason: VisibleReason) => {
    if (reason === 'visible') {
      tick.current = 0;
      baseline.current = null;
      router.refresh();
      return;
    }
    if (busy.current) return;
    busy.current = true;
    try {
      tick.current += 1;
      const version = await api.liveVersion().catch(() => null);
      const next = decideTick({ tick: tick.current, version, baseline: baseline.current });
      baseline.current = next.baseline;
      if (next.refresh) router.refresh();
    } finally {
      busy.current = false;
    }
  }, isLive ? POLL_MS : null);

  return null;
}
