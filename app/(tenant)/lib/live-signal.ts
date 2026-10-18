/**
 * Performance audit — one timer for a tab's background reads, not three.
 *
 * Three things used to poll on their own every 15 seconds: the live-version check (Home, Bookings, Free times), the
 * desktop bell's notification feed, and the phone's unread badge. An open, untouched Home cost about 35 database
 * statements a minute, and every one of them was asking the same question — "has anything happened?".
 *
 * Now `LiveRefresh` asks it once, every 30 seconds, on every screen (one cheap query), and says what it learned. The bell and
 * the badge listen instead of polling: they re-read the feed when the check says something moved, and every few ticks
 * regardless, because the version covers bookings, holds, the walk-in queue and attendance but not everything the feed
 * draws (a booking for next month starts outside its window, a bill issued is not on it). A quiet tab goes from nine
 * requests a minute to about three.
 */
export const LIVE_TICK_EVENT = 'growza:live-tick';

/** Every this-many ticks (two minutes at 30 seconds) the feed is re-read even if the version did not move. */
export const FEED_SAFETY_TICKS = 4;

export interface LiveTick {
  /** Which tick this is on the current screen, from 1. */
  tick: number;
  /** The version moved, or this was a forced tick — something may have changed. */
  changed: boolean;
}

/** Whether a listener that shows the notification feed should re-read it now. */
export function feedDue(t: LiveTick): boolean {
  return t.changed || t.tick % FEED_SAFETY_TICKS === 0;
}

export function announceLiveTick(t: LiveTick): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<LiveTick>(LIVE_TICK_EVENT, { detail: t }));
}

/** Listen for ticks. Returns the function that stops listening. */
export function onLiveTick(handler: (t: LiveTick) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<LiveTick>).detail);
  window.addEventListener(LIVE_TICK_EVENT, listener);
  return () => window.removeEventListener(LIVE_TICK_EVENT, listener);
}
