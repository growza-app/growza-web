'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVisibleInterval } from '../useVisibleInterval';

/**
 * Jira GRW-351 — the time a live card is drawn at, moved on once a minute.
 *
 * It starts at the server's `nowISO`, so the server render and the browser's first render agree, and then adds the
 * time that has passed in this tab since that value arrived: never the browser's own clock, which may be wrong.
 * `LiveRefresh` already redraws Home about once a minute with a fresh `nowISO`; this keeps "waiting 12 min" moving if
 * that redraw fails (the API is down, the check timed out), and catches up at once when the tab is shown again.
 */
export function useMinuteClock(nowISO: string): Date {
  const arrived = useRef<{ iso: string; at: number } | null>(null);
  const [elapsed, setElapsed] = useState<{ iso: string; ms: number }>({ iso: nowISO, ms: 0 });

  useEffect(() => {
    arrived.current = { iso: nowISO, at: Date.now() };
  }, [nowISO]);

  useVisibleInterval(() => {
    const from = arrived.current;
    if (!from || from.iso !== nowISO) return;
    setElapsed({ iso: nowISO, ms: Date.now() - from.at });
  }, 60_000);

  // A value from before the latest `nowISO` is stale: the new one already includes that time.
  const ms = elapsed.iso === nowISO ? elapsed.ms : 0;
  return useMemo(() => new Date(Date.parse(nowISO) + ms), [nowISO, ms]);
}
