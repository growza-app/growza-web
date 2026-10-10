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

/**
 * Every this-many ticks, redraw regardless, for time-driven state no change signal announces ("running late",
 * "next up").
 *
 * Owner-app audit 2026-10-10 — forty, not four. Every fourth tick was a full server render of Home every minute
 * — ten API calls, the headline grouping three times over — for every open tab, whether or not anything had
 * happened. The change signal (`/live-version`) already covers every booking, hold and payment; what the forced
 * tick keeps moving is wording that changes by the quarter hour, and ten minutes is soon enough for that.
 */
export const FORCE_EVERY_TICKS = 40;

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

/** A version check that has not answered by then is treated as failed, so it cannot hold the poll shut. */
const VERSION_TIMEOUT_MS = 8_000;

export function LiveRefresh({ initialVersion = null }: { initialVersion?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLive = shouldPoll(pathname);
  const tick = useRef(0);
  const baseline = useRef<string | null>(initialVersion);
  /** Bumped whenever the page has been (or is about to be) redrawn, so a check that was in flight for the old one is dropped. */
  const generation = useRef(0);
  const busy = useRef(false);

  // The version this render was drawn FROM. Every server render brings a fresh one (a full page
  // load, a tab return, a redraw this component asked for) and it is what the next tick is
  // compared against — not whatever the first poll happens to return, which would swallow a
  // change made in the gap between the render and that poll.
  useEffect(() => {
    baseline.current = initialVersion;
    generation.current += 1;
  }, [initialVersion]);

  // A different screen restarts the count. The baseline stays: at worst it is a version older
  // than the new page's, which costs one extra redraw, never a missed one.
  useEffect(() => {
    tick.current = 0;
    generation.current += 1;
  }, [pathname]);

  // Coming back to the tab refreshes wherever you are: you have been away,
  // and the first thing you look at should be current. That is one refetch
  // on a deliberate action, not a standing timer. The timer itself only runs
  // where the screen is about right now.
  useVisibleInterval(async (reason: VisibleReason) => {
    if (reason === 'visible') {
      tick.current = 0;
      generation.current += 1;
      router.refresh();
      return;
    }
    if (busy.current) return;
    busy.current = true;
    const mine = generation.current;
    tick.current += 1;
    const thisTick = tick.current;
    try {
      const version = await api.liveVersion(VERSION_TIMEOUT_MS).catch(() => null);
      // The page was redrawn or left while this was in flight: the answer is about a page that is gone.
      if (mine !== generation.current) return;
      const next = decideTick({ tick: thisTick, version, baseline: baseline.current });
      baseline.current = next.baseline;
      if (next.refresh) router.refresh();
    } finally {
      busy.current = false;
    }
  }, isLive ? POLL_MS : null);

  return null;
}
