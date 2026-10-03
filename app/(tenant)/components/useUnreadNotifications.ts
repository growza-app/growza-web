'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { api } from '../lib/api';
import { NOTIF_READ_EVENT, countUnread, readClearedBeforeId, readLastSeenId, useFeedBranch } from './NotificationBell';

const POLL_MS = 15_000;

/**
 * Jira GRW-338 — how many notifications are waiting: the number on the phone's Notifications tab.
 *
 * Same feed and same read cursor as the desktop bell and the Notifications page, so the three never disagree.
 * Polls like the bell does (paused while the tab is hidden), and re-counts at once when the cursor moves on
 * this tab, so "Mark all read" clears the badge without waiting for the next poll.
 *
 * `hostRef` is the element that carries the badge. On a laptop the bottom bar is `display: none` and the bell
 * does this job, so a hidden host means no request — the same rule the bell applies to itself (Jira GRW-310).
 */
export function useUnreadNotifications(hostRef: RefObject<HTMLElement | null>): number {
  const [events, setEvents] = useState<ReadonlyArray<{ id: string }>>([]);
  const [cursors, setCursors] = useState({ lastSeen: 0, cleared: 0 });
  const alive = useRef(true);
  const { location } = useFeedBranch();

  useEffect(() => {
    alive.current = true;
    const readCursors = () => setCursors({ lastSeen: readLastSeenId(), cleared: readClearedBeforeId() });
    readCursors();

    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      const host = hostRef.current;
      if (host && getComputedStyle(host).display === 'none') return;
      const rows = await api.notifications(50, location).catch(() => null);
      if (rows && alive.current) setEvents(rows);
      readCursors(); // another tab may have moved it
    };

    load();
    const timer = setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', load);
    window.addEventListener(NOTIF_READ_EVENT, readCursors);
    window.addEventListener('storage', readCursors);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
      window.removeEventListener(NOTIF_READ_EVENT, readCursors);
      window.removeEventListener('storage', readCursors);
    };
  }, [hostRef, location]);

  return countUnread(events, cursors.lastSeen, cursors.cleared);
}
