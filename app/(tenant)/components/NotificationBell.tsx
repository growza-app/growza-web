'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { DateTime } from 'luxon';
import { api, formatMoney, type ActivityEvent } from '../lib/api';
import { IconBell, IconCalendarPlus, IconClose, IconMoveTime, IconReceipt } from './icons';
import { useDialog } from '../../shared/a11y/useDialog';
import { useBranch } from './BranchProvider';

const POLL_MS = 15_000;
const TOAST_MS = 6_000;
const STORAGE_KEY = 'wa-booking:notifLastSeenId';
const CLEARED_KEY = 'wa-booking:notifClearedBeforeId';

/**
 * Jira GRW-301 — exported so the full-page version (notifications/page.tsx,
 * admin mobile's own equivalent replaced with a page rather than a popover)
 * reads and writes the SAME read/cleared state as this bell, rather than a
 * second copy that could disagree about what's already been seen.
 */

/** Highest event id the owner has explicitly acknowledged ("Mark all read") — per-device, since there's no per-user login yet to key this to. */
export function readLastSeenId(): number {
  if (typeof window === 'undefined') return 0;
  return Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
}

/** Events at or below this id are hidden entirely ("Clear all") — a display-only cutoff, never touches the underlying outbox rows. */
export function readClearedBeforeId(): number {
  if (typeof window === 'undefined') return 0;
  return Number(window.localStorage.getItem(CLEARED_KEY) ?? 0);
}

/**
 * Fired on this tab whenever the read cursor moves. A `storage` event only reaches OTHER tabs, and the
 * phone's Notifications badge (BottomNav) lives in the layout above the page that clears it.
 */
export const NOTIF_READ_EVENT = 'wa-booking:notif-read';

function announceReadChange(): void {
  window.dispatchEvent(new Event(NOTIF_READ_EVENT));
}

export function writeLastSeenId(id: number): void {
  window.localStorage.setItem(STORAGE_KEY, String(id));
  announceReadChange();
}

export function writeClearedBeforeId(id: number): void {
  window.localStorage.setItem(CLEARED_KEY, String(id));
  window.localStorage.setItem(STORAGE_KEY, String(id));
  announceReadChange();
}

/** What the bell, the Notifications page and the phone tab all show as the count: newer than both cursors. */
export function countUnread(events: ReadonlyArray<{ id: string | number }>, lastSeenId: number, clearedBeforeId: number): number {
  const floor = Math.max(lastSeenId, clearedBeforeId);
  return events.filter((e) => Number(e.id) > floor).length;
}

/** The words are `notifications.feed.topics.<key>`; only the icon and class live here. */
export const TOPIC_META: Record<ActivityEvent['topic'], { key: 'newBooking' | 'cancelled' | 'rescheduled' | 'billing'; icon: ComponentType; cls: string }> = {
  'appointment.confirmed': { key: 'newBooking', icon: IconCalendarPlus, cls: 'notif-new' },
  'appointment.cancelled': { key: 'cancelled', icon: IconClose, cls: 'notif-cancel' },
  'appointment.rescheduled': { key: 'rescheduled', icon: IconMoveTime, cls: 'notif-reschedule' },
  // Jira GRW-301 — replaces the old top-of-page BillChangeBanner, which had
  // no dismiss and no read state; this is a normal feed entry now.
  'billing.change_pending': { key: 'billing', icon: IconReceipt, cls: 'notif-billing' },
};

/** The `notifications.feed` messages, as a translator — these are plain helpers and cannot call hooks. */
export type FeedT = ReturnType<typeof useTranslations<'notifications.feed'>>;

export function timeAgo(iso: string, now: Date, t: FeedT): string {
  const diffMin = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return t('justNow');
  if (diffMin < 60) return t('minutesAgo', { count: diffMin });
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return t('hoursAgo', { count: diffH });
  return t('daysAgo', { count: Math.round(diffH / 24) });
}

/**
 * Jira GRW-301 — the same sentence `BillChangeBanner` used to render as a
 * permanent banner, now one feed entry: "Bill going down · from 1 Oct:
 * ₹798/month (now ₹998), for 2 branches."
 */
function billingLine(billing: NonNullable<ActivityEvent['billing']>, t: FeedT, locale: string): { title: string; subtitle: string } {
  const [y, m, d] = billing.effectiveFrom.split('-').map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(`${locale}-IN`, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const up = billing.nextMonthlyMinor > billing.currentMonthlyMinor;
  return {
    title: up ? t('billUp') : t('billDown'),
    subtitle: t('billSub', {
      day,
      next: formatMoney(String(billing.nextMonthlyMinor), billing.currency),
      current: formatMoney(String(billing.currentMonthlyMinor), billing.currency),
      count: billing.openBranches,
    }),
  };
}

/**
 * Jira GRW-477 — the feed follows the header's branch, like every other screen. On "All branches" each row says
 * where it happened; a pinned receptionist's feed is their branch already, server-side.
 */
export function useFeedBranch(): { location: string | null; showBranch: boolean } {
  const b = useBranch();
  const free = b.multi && !b.pinned;
  return { location: free ? b.choice : null, showBranch: free && !b.choice };
}

export function eventLine(
  e: ActivityEvent,
  timezone: string,
  t: FeedT,
  locale: string,
  showBranch = false,
): { title: string; subtitle: string } {
  if (e.topic === 'billing.change_pending' && e.billing) return billingLine(e.billing, t, locale);
  const services = (e.serviceNames ?? []).join(' + ');
  const local = e.startAt ? DateTime.fromISO(e.startAt).setZone(timezone).setLocale(locale).toFormat('ccc, h:mm a') : '';
  const customer = e.customerName ?? t('customer');
  return {
    title: t('title', { topic: t(`topics.${TOPIC_META[e.topic].key}`), services }),
    subtitle: [customer, local, showBranch ? e.branchName : null].filter(Boolean).join(' · '),
  };
}

function Toast({ event, timezone }: { event: ActivityEvent; timezone: string }) {
  const t = useTranslations('notifications.feed');
  const locale = useLocale();
  const Icon = TOPIC_META[event.topic].icon;
  return (
    <div className="notif-toast" role="status">
      <span className={`notif-icon ${TOPIC_META[event.topic].cls}`}>
        <Icon />
      </span>
      <span className="notif-toast-text">{eventLine(event, timezone, t, locale).title}</span>
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
  const t = useTranslations('notifications');
  const tf = useTranslations('notifications.feed');
  const locale = useLocale();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [lastSeenId, setLastSeenId] = useState(0);
  const [clearedBeforeId, setClearedBeforeId] = useState(0);
  const [toastEvent, setToastEvent] = useState<ActivityEvent | null>(null);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const feed = useFeedBranch();
  // On mobile the dropdown is viewport-centered (position: fixed), so it can't
  // just inherit "top" from where the bell happens to sit in the header the
  // way the desktop absolute-positioned version does — header height varies
  // a lot per page (Home's wrapping greeting line vs. a plain one-line
  // title elsewhere). Measured fresh on each open instead of guessed in CSS.
  const [mobileTop, setMobileTop] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Jira GRW-342 — a popover: focus moves in, Escape closes and returns to the bell, Tab past the end closes it.
  useDialog(dropdownRef, { onClose: () => setOpen(false), active: open, trapTab: false });
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
    // A branch switch is a different feed, not new arrivals: no toast for what was already there.
    hasLoadedOnce.current = false;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      // Jira GRW-310 — not while it is not on screen. On a phone the bell is hidden (the
      // Notifications tab is the way in), and so is its toast; polling for an unseen
      // bell is a request every 15 seconds that nothing can show.
      if (wrapRef.current && getComputedStyle(wrapRef.current).display === 'none') return;
      const rows = await api.notifications(20, feed.location).catch(() => null);
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
  }, [feed.location]);

  const visibleEvents = events.filter((e) => Number(e.id) > clearedBeforeId);
  const unreadCount = countUnread(events, lastSeenId, clearedBeforeId);

  const markAllRead = () => {
    const newest = events.length > 0 ? Number(events[0]!.id) : lastSeenId;
    writeLastSeenId(newest);
    setLastSeenId(newest);
  };

  const clearAll = () => {
    const newest = Math.max(events.length > 0 ? Number(events[0]!.id) : 0, maxKnownId.current);
    writeClearedBeforeId(newest);
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
    // Jira GRW-301 — desktop-only: on a phone, Notifications is its own
    // bottom-nav tab and full page now (notifications/page.tsx), so the
    // header's copy of this would be a second, redundant way in — the same
    // reasoning the admin portal's header bell was hidden on mobile for.
    <div
      className="notif-wrap desktop-only"
      ref={wrapRef}
      style={mobileTop != null ? ({ '--notif-mobile-top': `${mobileTop}px` } as CSSProperties) : undefined}
    >
      <button
        type="button"
        className="icon-btn notif-bell"
        aria-label={unreadCount > 0 ? t('bellUnread', { count: unreadCount }) : t('title')}
        onClick={toggleOpen}
      >
        <IconBell />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <>
          <div className="notif-scrim" onClick={() => setOpen(false)} />
          <div className="notif-dropdown" role="dialog" aria-label={t('title')} ref={dropdownRef}>
            <div className="notif-dropdown-head">
              <span>{t('title')}</span>
              <div className="notif-dropdown-actions">
                {unreadCount > 0 && (
                  <button type="button" className="notif-mark-read" onClick={markAllRead}>
                    {t('markAllRead')}
                  </button>
                )}
                {visibleEvents.length > 0 && (
                  <button type="button" className="notif-clear-all" onClick={clearAll}>
                    {t('clearAll')}
                  </button>
                )}
              </div>
            </div>
            {visibleEvents.length === 0 ? (
              <div className="notif-empty">{t('empty')}</div>
            ) : (
              <div className="notif-list">
                {visibleEvents.map((e) => {
                  const meta = TOPIC_META[e.topic];
                  const Icon = meta.icon;
                  const line = eventLine(e, timezone, tf, locale, feed.showBranch);
                  const unread = Number(e.id) > lastSeenId;
                  return (
                    <div key={e.id} className={`notif-item ${unread ? 'notif-item-unread' : ''}`}>
                      <span className={`notif-icon ${meta.cls}`}>
                        <Icon />
                      </span>
                      <div className="notif-item-body">
                        <div className="notif-item-title">{line.title}</div>
                        <div className="notif-item-sub">
                          {line.subtitle} · {timeAgo(e.createdAt, new Date(), tf)}
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
