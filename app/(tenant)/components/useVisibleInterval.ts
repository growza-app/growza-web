'use client';

import { useEffect, useRef } from 'react';

/**
 * Jira GRW-304 — the visibility-gated timer `LiveRefresh` and `SessionRefresh`
 * both need, pulled out after the second one copy-pasted the first's `useEffect`
 * wholesale. Runs `callback` on a `setInterval` of `intervalMs` (pass `null` to
 * skip the interval and only react to visibility, as a route-scoped poller might),
 * and always on `visibilitychange` — coming back to a backgrounded tab should not
 * wait for the next tick. Both call sites only ever fire `callback` while
 * `document.visibilityState === 'visible'`; a real backgrounded tab throttles a
 * `setInterval` regardless, so this is belt-and-braces, not the only guard.
 *
 * `callback` is told why it ran (`'tick'` or `'visible'`), and is read through a ref rather than listed as an effect dependency, so
 * passing a fresh closure every render (the common case) does not tear down and
 * re-register the listeners on every render — only a change to `intervalMs` does.
 */
export type VisibleReason = 'tick' | 'visible';

export function useVisibleInterval(callback: (reason: VisibleReason) => void, intervalMs: number | null): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') callbackRef.current('tick');
    };
    // Jira GRW-310 — told apart from a timer tick: coming back to a tab you left is the
    // moment to redraw unconditionally, where a tick may first ask whether it needs to.
    const visible = () => {
      if (document.visibilityState === 'visible') callbackRef.current('visible');
    };

    document.addEventListener('visibilitychange', visible);
    const id = intervalMs !== null ? setInterval(tick, intervalMs) : undefined;

    return () => {
      if (id) clearInterval(id);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [intervalMs]);
}
