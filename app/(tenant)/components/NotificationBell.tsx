'use client';

import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { DateTime } from 'luxon';
import { api, type ActivityEvent } from '../lib/api';
import { IconBell, IconCalendarPlus, IconClose, IconMoveTime } from './icons';

const POLL_MS = 15_000;
const TOAST_MS = 6_000;
const STORAGE_KEY = 'wa-booking:notifLastSeenId';
const CLEARED_KEY = 'wa-booking:notifClearedBeforeId';

/** Highest event id the owner has explicitly acknowledged ("Mark all read") — per-device, since there's no per-user login yet to key this to. */
function readLastSeenId(): number {
  if (typeof window === 'undefined') return 0;
  return Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
}

/** Events at or below this id are hidden entirely ("Clear all") — a display-only cutoff, never touches the underlying outbox rows. */
function readClearedBeforeId(): number {
  if (typeof window === 'undefined') return 0;
  return Number(window.localStorage.getItem(CLEARED_KEY) ?? 0);
}

const TOPIC_META: Record<ActivityEvent['topic'], { label: string; icon: ComponentType; cls: string }> = {
  'appointment.confirmed': { label: 'New booking', icon: IconCalendarPlus, cls: 'notif-new' },
  'appointment.cancelled': { label: 'Cancelled', icon: IconClose, cls: 'notif-cancel' },
  'appointment.rescheduled': { label: 'Rescheduled', icon: IconMoveTime, cls: 'notif-reschedule' },
};

function timeAgo(iso: string, now: Date): string {
  const diffMin = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

function eventLine(e: ActivityEvent, timezone: string): { title: string; subtitle: string } {
  const services = e.serviceNames.join(' + ');
  const local = DateTime.fromISO(e.startAt).setZone(timezone).toFormat('ccc, h:mm a');
  return {
    title: `${TOPIC_META[e.topic].label} — ${services}`,
    subtitle: `${e.customerName ?? 'Customer'} · ${local}`,
  };
}

function Toast({ event, timezone }: { event: ActivityEvent; timezone: string }) {
  const Icon = TOPIC_META[event.topic].icon;
  return (
    <div className="notif-toast" role="status">
      <span className={`notif-icon ${TOPIC_META[event.topic].cls}`}>
        <Icon />
      </span>
      <span className="notif-toast-text">{eventLine(event, timezone).title}</span>
    </div>
  );
}

/**
 * The notification bell: unread badge, a dropdown with recent WhatsApp
 * booking activity, and a toast for whatever arrives while the dropdown's
 * closed. Self-contained — polls its own feed on a timer (paused while the
 * tab is hidden, same convention as LiveRefresh) rather than depending on
 * a page passing data down, so it can be dropped into any header.
 */
export function NotificationBell() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [lastSeenId, setLastSeenId] = useState(0);
  const [clearedBeforeId, setClearedBeforeId] = useState(0);
  const [toastEvent, setToastEvent] = useState<ActivityEvent | null>(null);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  // On mobile the dropdown is viewport-centered (position: fixed), so it can't
  // just inherit "top" from where the bell happens to sit in the header the
  // way the desktop absolute-positioned version does — header height varies
  // a lot per page (Home's wrapping greeting line vs. a plain one-line
  // title elsewhere). Measured fresh on each open instead of guessed in CSS.
  const [mobileTop, setMobileTop] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const maxKnownId = useRef(0);
  const hasLoadedOnce = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLastSeenId(readLastSeenId());
    setClearedBeforeId(readClearedBeforeId());
    api.me().then((me) => {
      if (me.tenant?.timezone) setTimezone(me.tenant.timezone);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      const rows = await api.notifications(20).catch(() => null);
      if (!rows) return;

      const newestId = rows.length > 0 ? Number(rows[0]!.id) : 0;
      if (hasLoadedOnce.current && newestId > maxKnownId.current) {
        setToastEvent(rows[0]!);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastEvent(null), TOAST_MS);
      }
      maxKnownId.current = Math.max(maxKnownId.current, newestId);
      hasLoadedOnce.current = true;
      setEvents(rows);
    };

    load();
    const id = setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', load);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const visibleEvents = events.filter((e) => Number(e.id) > clearedBeforeId);
  const unreadCount = visibleEvents.filter((e) => Number(e.id) > lastSeenId).length;

  const markAllRead = () => {
    const newest = events.length > 0 ? Number(events[0]!.id) : lastSeenId;
    window.localStorage.setItem(STORAGE_KEY, String(newest));
    setLastSeenId(newest);
  };

  const clearAll = () => {
    const newest = Math.max(events.length > 0 ? Number(events[0]!.id) : 0, maxKnownId.current);
    window.localStorage.setItem(CLEARED_KEY, String(newest));
    window.localStorage.setItem(STORAGE_KEY, String(newest));
    setClearedBeforeId(newest);
    setLastSeenId(newest);
  };

  const toggleOpen = () => {
    setOpen((v) => {
      const next = !v;
      // The bell sits vertically centered within its header row — on Home
      // that row is much taller than the bell itself (the greeting text
      // wraps to two lines beside it), so the bell's own bottom edge lands
      // well above where the header actually ends. Anchor to the header
      // (both PageHeader's `.topbar` and Home's `.home-head` are a real
      // <header>) rather than the bell, so this works on every page without
      // needing to know its particular layout.
      const header = wrapRef.current?.closest('header');
      if (next && header) {
        setMobileTop(header.getBoundingClientRect().bottom + 10);
      }
      return next;
    });
  };

  return (
    <div
      className="notif-wrap"
      ref={wrapRef}
      style={mobileTop != null ? ({ '--notif-mobile-top': `${mobileTop}px` } as CSSProperties) : undefined}
    >
      <button
        type="button"
        className="icon-btn notif-bell"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        onClick={toggleOpen}
      >
        <IconBell />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <>
          <div className="notif-scrim" onClick={() => setOpen(false)} />
          <div className="notif-dropdown" role="dialog" aria-label="Notifications">
            <div className="notif-dropdown-head">
              <span>Notifications</span>
              <div className="notif-dropdown-actions">
                {unreadCount > 0 && (
                  <button type="button" className="notif-mark-read" onClick={markAllRead}>
                    Mark all read
                  </button>
                )}
                {visibleEvents.length > 0 && (
                  <button type="button" className="notif-clear-all" onClick={clearAll}>
                    Clear all
                  </button>
                )}
              </div>
            </div>
            {visibleEvents.length === 0 ? (
              <div className="notif-empty">Nothing yet — new bookings will show up here.</div>
            ) : (
              <div className="notif-list">
                {visibleEvents.map((e) => {
                  const meta = TOPIC_META[e.topic];
                  const Icon = meta.icon;
                  const line = eventLine(e, timezone);
                  const unread = Number(e.id) > lastSeenId;
                  return (
                    <div key={e.id} className={`notif-item ${unread ? 'notif-item-unread' : ''}`}>
                      <span className={`notif-icon ${meta.cls}`}>
                        <Icon />
                      </span>
                      <div className="notif-item-body">
                        <div className="notif-item-title">{line.title}</div>
                        <div className="notif-item-sub">
                          {line.subtitle} · {timeAgo(e.createdAt, new Date())}
                        </div>
                      </div>
                      {unread && <span className="notif-dot" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {toastEvent && <Toast event={toastEvent} timezone={timezone} />}
    </div>
  );
}
