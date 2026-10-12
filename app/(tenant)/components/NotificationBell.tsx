'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import { api, formatMoney, type ActivityEvent } from '../lib/api';
import { IconAlert, IconBan, IconBell, IconCalendarPlus, IconChat, IconClipboardCheck, IconClose, IconMoveTime, IconPercent, IconReceipt, IconRepeat, IconRupee, IconUserPlus } from './icons';
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
export type TopicKey =
  | 'newBooking' | 'cancelled' | 'rescheduled' | 'walkIn' | 'completed' | 'noShow'
  | 'billing' | 'invoice' | 'payment' | 'discount' | 'autopay' | 'handoff' | 'attendanceIn' | 'attendancePending';
export const TOPIC_META: Record<ActivityEvent['topic'], { key: TopicKey; icon: ComponentType; cls: string }> = {
  'appointment.confirmed': { key: 'newBooking', icon: IconCalendarPlus, cls: 'notif-new' },
  'appointment.cancelled': { key: 'cancelled', icon: IconClose, cls: 'notif-cancel' },
  'appointment.rescheduled': { key: 'rescheduled', icon: IconMoveTime, cls: 'notif-reschedule' },
  // Jira GRW-562 — what somebody else at the salon did in the dashboard.
  'appointment.walk_in': { key: 'walkIn', icon: IconUserPlus, cls: 'notif-new' },
  'appointment.completed': { key: 'completed', icon: IconClipboardCheck, cls: 'notif-done' },
  'appointment.no_show': { key: 'noShow', icon: IconBan, cls: 'notif-cancel' },
  // Jira GRW-562 — the bill, for the owner and manager.
  'billing.invoice': { key: 'invoice', icon: IconReceipt, cls: 'notif-billing' },
  'billing.payment': { key: 'payment', icon: IconRupee, cls: 'notif-done' },
  'billing.status': { key: 'billing', icon: IconAlert, cls: 'notif-billing' },
  'billing.discount': { key: 'discount', icon: IconPercent, cls: 'notif-billing' },
  'billing.autopay_halted': { key: 'autopay', icon: IconRepeat, cls: 'notif-cancel' },
  // Jira GRW-301 — replaces the old top-of-page BillChangeBanner, which had
  // no dismiss and no read state; this is a normal feed entry now.
  'billing.change_pending': { key: 'billing', icon: IconReceipt, cls: 'notif-billing' },
  // Jira GRW-479 (R-5) — a client asked the chat for a person; the bot has gone quiet for them.
  'conversation.handoff': { key: 'handoff', icon: IconChat, cls: 'notif-handoff' },
  // A stylist marked themselves in from their phone: green when it counted, amber when it waits for a yes or no.
  'attendance.in': { key: 'attendanceIn', icon: IconClipboardCheck, cls: 'notif-done' },
  'attendance.pending': { key: 'attendancePending', icon: IconClipboardCheck, cls: 'notif-handoff' },
};

/**
 * A topic this dashboard has no row for is dropped, not rendered: the API and the dashboard deploy separately, so a
 * newer API can send a topic an older (or cached) dashboard does not know, and looking it up in TOPIC_META would
 * throw and take the bell and the Notifications page down with it. Applied wherever the feed is read, so the
 * unread count ignores it too — a badge for a row nobody can see is worse than no badge.
 */
export function knownEvents(rows: ReadonlyArray<ActivityEvent>): ActivityEvent[] {
  return rows.filter((e) => Object.prototype.hasOwnProperty.call(TOPIC_META, e.topic));
}

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
function billingLine(billing: { currency: string; currentMonthlyMinor: number; nextMonthlyMinor: number; effectiveFrom: string; openBranches: number }, t: FeedT, locale: string): { title: string; subtitle: string } {
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

/** Jira GRW-562 — a billing row's words. `t` keys are `notifications.feed.*`; the status words match the banner's. */
function billingRow(e: ActivityEvent, t: FeedT, locale: string): { title: string; subtitle: string } | null {
  const b = e.billing as Record<string, unknown> | null;
  if (!b) return null;
  const money = (minor: unknown) => formatMoney(String(Number(minor ?? 0)), String(b.currency ?? 'INR'));
  const sub = t('billingSub');
  switch (e.topic) {
    case 'billing.invoice': {
      const [y, m] = String(b.periodStart ?? '').split('-').map(Number);
      const month = y && m ? new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(`${locale}-IN`, { month: 'long', timeZone: 'UTC' }) : '';
      return { title: t('invoiceTitle', { month, amount: money(b.totalMinor) }), subtitle: sub };
    }
    case 'billing.payment':
      return { title: t('paymentTitle', { amount: money(b.amountMinor) }), subtitle: sub };
    case 'billing.discount':
      return { title: Number(b.discountAmountMinor ?? 0) > 0 ? t('discountOn', { amount: money(b.discountAmountMinor) }) : t('discountOff'), subtitle: sub };
    case 'billing.autopay_halted':
      return { title: t('autopayHalted'), subtitle: sub };
    case 'billing.status': {
      const status = String(b.status ?? '');
      const known = ['PAYMENT_FAILED', 'GRACE_PERIOD', 'PAST_DUE', 'SUSPENDED', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED'];
      return { title: t(`status.${known.includes(status) ? status : 'OTHER'}` as never), subtitle: sub };
    }
    default:
      return null;
  }
}

/** Jira GRW-562 — "by Priya" / "by Front desk": who at the salon did it, when somebody did. */
export function byWhom(e: Pick<ActivityEvent, 'actorName' | 'actorRole'>, t: FeedT): string | null {
  if (e.actorName) return t('by', { who: e.actorName });
  if (e.actorRole) return t('by', { who: t(`roles.${e.actorRole}`) });
  return null;
}

export function eventLine(
  e: ActivityEvent,
  timezone: string,
  t: FeedT,
  locale: string,
  showBranch = false,
): { title: string; subtitle: string } {
  if (e.topic === 'billing.change_pending' && e.billing) return billingLine(e.billing as NonNullable<Parameters<typeof billingLine>[0]>, t, locale);
  const billing = billingRow(e, t, locale);
  if (billing) return billing;
  if (e.topic === 'conversation.handoff') {
    const who = e.customerName ?? t('customer');
    return { title: t('handoffTitle'), subtitle: [who, showBranch ? e.branchName : null].filter(Boolean).join(' · ') };
  }
  if (e.topic === 'attendance.in' || e.topic === 'attendance.pending') {
    const who = e.actorName ?? t('roles.staff');
    const at = e.startAt ? DateTime.fromISO(e.startAt).setZone(timezone).setLocale(locale).toFormat('h:mm a') : null;
    return {
      title: t(e.topic === 'attendance.in' ? 'attendanceInTitle' : 'attendancePendingTitle', { who }),
      subtitle: [at, showBranch ? e.branchName : null].filter(Boolean).join(' · '),
    };
  }
  const services = (e.serviceNames ?? []).join(' + ');
  const local = e.startAt ? DateTime.fromISO(e.startAt).setZone(timezone).setLocale(locale).toFormat('ccc, h:mm a') : '';
  const customer = e.customerName ?? t('customer');
  return {
    title: t('title', { topic: t(`topics.${TOPIC_META[e.topic].key}`), services }),
    subtitle: [customer, local, byWhom(e, t), showBranch ? e.branchName : null].filter(Boolean).join(' · '),
  };
}

/**
 * Jira GRW-562 — where a feed row goes when it is tapped, or null when there is
 * nowhere honest to send it.
 *
 * A booking row opens that booking: the Bookings screen on its day with the
 * sheet open — the same `?date=&open=` shape Search uses (GRW-307,
 * SearchClient's `bookingHref`). BOTH parameters, not just `open`: the sheet
 * is found among the bookings the screen has already loaded
 * (BookingsList.tsx:295), and that screen defaults to today, so `?open=` on
 * its own silently opens nothing for any booking on another day.
 *
 * The day alone is the fallback, for an API older than `appointmentId` — the
 * two repos deploy separately, and a row that cannot open the booking should
 * still open the right list rather than nothing.
 *
 * Either way the day is the salon's: `startAt` is a UTC instant, and a 9 pm
 * booking in India is already tomorrow in UTC, so slicing the raw string would
 * open an empty day for every evening booking.
 */
export function notifHref(event: ActivityEvent, timezone: string): string | null {
  if (event.topic.startsWith('billing.')) return '/settings/billing';
  if (event.topic.startsWith('appointment.')) {
    const day = event.startAt ? DateTime.fromISO(event.startAt).setZone(timezone) : null;
    // `?date=` alone is exactly one day — the Bookings screen defaults `to` to it.
    const date = day?.isValid ? `date=${day.toISODate()}` : null;
    const open = event.appointmentId ? `open=${event.appointmentId}` : null;
    const params = [date, open].filter(Boolean).join('&');
    return params ? `/appointments?${params}` : null;
  }
  // The register, on the day it was marked (the salon's day, like a booking's) — where the yes or no is given.
  if (event.topic.startsWith('attendance.')) {
    const day = event.startAt ? DateTime.fromISO(event.startAt).setZone(timezone) : null;
    return day?.isValid ? `/attendance?date=${day.toISODate()}` : '/attendance';
  }
  // conversation.handoff has no screen of its own yet; a row that goes nowhere
  // stays a plain row rather than a link that lands somewhere unrelated.
  return null;
}

/**
 * Jira GRW-562 — one feed row, shared by the desktop bell and the phone's
 * Notifications page so the two cannot drift again: every booking row was a
 * bare `<div>` on both, and only the page's billing rows had a handler.
 *
 * A real `<a>`, not a div with `role="link"` and an Enter-only `onKeyDown`:
 * that handled neither Space nor middle-click nor open-in-new-tab, and the
 * billing row's own subtitle already says "Tap to see your bill".
 */
export function NotifRow({
  event,
  unread,
  line,
  timezone,
  t,
  onNavigate,
}: {
  event: ActivityEvent;
  unread: boolean;
  line: { title: string; subtitle: string };
  timezone: string;
  t: FeedT;
  onNavigate?: () => void;
}) {
  const meta = TOPIC_META[event.topic];
  const Icon = meta.icon;
  const href = notifHref(event, timezone);
  const className = `notif-item ${unread ? 'notif-item-unread' : ''}`;
  const inner = (
    <>
      <span className={`notif-icon ${meta.cls}`}>
        <Icon />
      </span>
      <div className="notif-item-body">
        <div className="notif-item-title">{line.title}</div>
        <div className="notif-item-sub">
          {line.subtitle} · {timeAgo(event.createdAt, new Date(), t)}
        </div>
      </div>
      {unread && <span className="notif-dot" />}
    </>
  );
  if (!href) return <div className={className}>{inner}</div>;
  return (
    <Link href={href} className={`${className} notif-item-link`} onClick={onNavigate}>
      {inner}
    </Link>
  );
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
      const fetched = await api.notifications(20, feed.location).catch(() => null);
      if (!fetched) return;
      const rows = knownEvents(fetched);

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
                {visibleEvents.map((e, i) => (
                  // `id` is a timestamp (GRW-562): two rows written in one transaction share it, so the key adds the position.
                  <NotifRow
                    key={`${e.id}-${i}`}
                    event={e}
                    unread={Number(e.id) > lastSeenId}
                    line={eventLine(e, timezone, tf, locale, feed.showBranch)}
                    timezone={timezone}
                    t={tf}
                    // The bell lives in the header and survives the navigation, so it has to shut itself.
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {toastEvent && <Toast event={toastEvent} timezone={timezone} />}
    </div>
  );
}
