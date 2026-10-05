import { useEffect, useRef } from 'react';

/**
 * A visit changed — money was taken, a booking was marked done, a token was given or dropped.
 *
 * `router.refresh()` re-reads what the server rendered (the queue, the day's bookings), but Home's
 * money and client cards are held in the browser and only re-read when the branch or period changes,
 * so they stayed at the old figures until a reload. The sheets announce the change here and Home
 * re-reads on it: one request when something actually happened, never on a timer.
 */
const EVENT = 'growza:visit-changed';

export function announceVisitChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

/** Runs `onChange` whenever a visit changes; always calls the latest closure. */
export function useOnVisitChanged(onChange: () => void): void {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    const run = () => latest.current();
    window.addEventListener(EVENT, run);
    return () => window.removeEventListener(EVENT, run);
  }, []);
}
