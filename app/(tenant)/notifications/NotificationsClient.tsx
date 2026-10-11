'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api, type ActivityEvent } from '../lib/api';
import { loadErrorKind, type LoadErrorKind } from '../lib/load-error';
import { PageHeader } from '../components/PageHeader';
import {
  NotifRow,
  countUnread,
  eventLine,
  useFeedBranch,
  readClearedBeforeId,
  readLastSeenId,
  writeClearedBeforeId,
  writeLastSeenId,
} from '../components/NotificationBell';

/**
 * Jira GRW-301 — admin mobile's own Notifications page, built the same way:
 * a bottom-nav tab (BottomNav.tsx) opens a full page instead of the header
 * bell's popover (NotificationBell.tsx, now desktop-only), with a back
 * button rather than dismiss-on-outside-click.
 *
 * Unlike admin's page — a live status snapshot with no per-item read state —
 * this one IS an inbox: it reads and writes the exact same localStorage
 * read/cleared cursor the bell already kept, so "Mark all read" here and on
 * the bell never disagree about what's already been seen.
 *
 * `GET /api/v1/notifications` answers every role now (Jira GRW-301 opened it
 * to receptionist unscoped and staff scoped to their own chair — see
 * tenant-policy.ts's own note) — this page needs no role check of its own.
 *
 * A client component, not the route's `page.tsx` itself: `metadata` (the
 * browser tab's title) can only be exported from a Server Component, so
 * `page.tsx` stays a thin server shell and this is everything interactive.
 */
export function NotificationsClient() {
  const t = useTranslations('errors');
  const n = useTranslations('notifications');
  const nf = useTranslations('notifications.feed');
  const locale = useLocale();
  const router = useRouter();
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<LoadErrorKind | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastSeenId, setLastSeenId] = useState(0);
  const [clearedBeforeId, setClearedBeforeId] = useState(0);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const feed = useFeedBranch();

  useEffect(() => {
    setLastSeenId(readLastSeenId());
    setClearedBeforeId(readClearedBeforeId());
    api.me().then((me) => {
      if (me.tenant?.timezone) setTimezone(me.tenant.timezone);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // The full page, not the bell's 20-row dropdown — the same 50-row cap
    // `/api/v1/notifications` already enforces server-side.
    api.notifications(50, feed.location)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(loadErrorKind(err));
      });
    return () => {
      cancelled = true;
    };
  }, [retryCount, feed.location]);

  const visibleEvents = (events ?? []).filter((e) => Number(e.id) > clearedBeforeId);
  const unreadCount = countUnread(events ?? [], lastSeenId, clearedBeforeId);

  const markAllRead = () => {
    const newest = events && events.length > 0 ? Number(events[0]!.id) : lastSeenId;
    writeLastSeenId(newest);
    setLastSeenId(newest);
  };

  const clearAll = () => {
    const newest = events && events.length > 0 ? Number(events[0]!.id) : 0;
    writeClearedBeforeId(newest);
    setClearedBeforeId(newest);
    setLastSeenId(newest);
  };

  return (
    <>
      <PageHeader title={n('title')} onBack={() => router.back()} bare />
      <div className="page-body">
        {error ? (
          <div className="banner">
            <strong>{t(error)}</strong>
            {error === 'busy' ? <> {t('busyHelp')}</> : null}
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setRetryCount((n) => n + 1)}>
                {t('tryAgain')}
              </button>
            </div>
          </div>
        ) : !events ? (
          <div className="card">
            <div className="notif-empty">{n('loading')}</div>
          </div>
        ) : (
          <div className="card">
            {unreadCount > 0 || visibleEvents.length > 0 ? (
              <div className="card-head" style={{ justifyContent: 'flex-end' }}>
                <div className="notif-dropdown-actions">
                  {unreadCount > 0 && (
                    <button type="button" className="notif-mark-read" onClick={markAllRead}>
                      {n('markAllRead')}
                    </button>
                  )}
                  {visibleEvents.length > 0 && (
                    <button type="button" className="notif-clear-all" onClick={clearAll}>
                      {n('clearAll')}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
            {visibleEvents.length === 0 ? (
              <div className="notif-empty">{n('empty')}</div>
            ) : (
              visibleEvents.map((e, i) => (
                // Jira GRW-562 — a billing row opens the bill and a booking row opens its day
                // (NotifRow decides); the key adds the position because `id` is a timestamp.
                <NotifRow
                  key={`${e.id}-${i}`}
                  event={e}
                  unread={Number(e.id) > lastSeenId}
                  line={eventLine(e, timezone, nf, locale, feed.showBranch)}
                  timezone={timezone}
                  t={nf}
                />
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
