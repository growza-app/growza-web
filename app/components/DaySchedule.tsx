'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatTime, type Appointment } from '../lib/api';
import { copy } from '../lib/copy';
import { formatDuration, groupBookings, initials, statusChip, type BookingGroup } from '../lib/appointment-display';
import { BookingSheet, dialable } from './BookingSheet';
import { IconChevronRight, IconPhone } from './icons';

/**
 * One time-ordered list for the whole day — deliberately NOT two lists.
 * A separate "happening next" section duplicates rows that also appear in
 * the day list; instead each row's weight varies by how urgent it is:
 *
 *   past + settled   -> dimmed one-liner, no actions left to take
 *   past + unmarked  -> full card, same as imminent
 *   imminent         -> full card with call and details
 *   later today      -> compact reference row
 *
 * The "now" divider sits between past and future, so it IS the what's-next
 * signal and nothing has to be listed twice to provide one.
 *
 * A combo / multi-service booking is ONE row here too (its legs share a
 * `bookingGroupId`) — showing every service and the total time booked, never a
 * separate row per service.
 */

/** How many upcoming bookings get the full-detail treatment before the rest collapse. */
const RICH_GROUPS = 2;
/** Home never paginates — it shows a window anchored on now; "See all" carries the rest. */
const MAX_BOOKINGS = 5;

function Avatar({ name, muted }: { name: string | null; muted?: boolean }) {
  return (
    <div className="avatar" style={muted ? { background: 'var(--slate-soft)', color: 'var(--muted)' } : undefined}>
      {initials(name)}
    </div>
  );
}

function TimeCell({ booking, timezone }: { booking: BookingGroup; timezone: string }) {
  const [clock, meridiem] = formatTime(booking.startAt, timezone).split(' '); // e.g. "11:30 am"
  return (
    <div className="sched-time">
      <div className="t">
        {clock} <span className="m">{meridiem}</span>
      </div>
      <div className="n">{formatDuration(booking.totalMin)}</div>
    </div>
  );
}

/** What each booking shows as its "service" line — every service, plus the staff. */
function metaLine(booking: BookingGroup): string {
  const services = booking.serviceNames.join(' + ');
  const staff = booking.providerNames.join(', ');
  return staff ? `${services} · ${staff}` : services;
}

export function DaySchedule({
  appointments,
  timezone,
  nowISO,
}: {
  appointments: Appointment[];
  timezone: string;
  /** Server's clock, passed in so the first client render matches the server HTML exactly. */
  nowISO: string;
}) {
  // Seeded from the server value, then switched to the real device clock
  // after mount and ticked every minute so the "now" line stays honest.
  const [now, setNow] = useState(() => new Date(nowISO));
  const [open, setOpen] = useState<BookingGroup | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const bookings = useMemo(() => groupBookings(appointments), [appointments]);

  if (appointments.length === 0) {
    return <div className="sched"><div className="empty">{copy.home.nothingToday}</div></div>;
  }

  const startMs = (b: BookingGroup) => new Date(b.startAt).getTime();

  // Window anchored on NOW — one just-past booking for context, then upcoming.
  const firstFutureIdx = bookings.findIndex((b) => startMs(b) > now.getTime());
  const startIdx =
    firstFutureIdx === -1
      ? Math.max(0, bookings.length - MAX_BOOKINGS) // day's done — show the most recent
      : Math.max(0, firstFutureIdx - 1);
  const shown = bookings.slice(startIdx, startIdx + MAX_BOOKINGS);
  const hiddenCount = bookings.length - shown.length;

  // Derived from the visible window: the "now" divider sits between the past and
  // future bookings actually on screen.
  const firstFuture = shown.findIndex((b) => startMs(b) > now.getTime());
  const futureStart = firstFuture === -1 ? shown.length : firstFuture;

  const callButton = (booking: BookingGroup, strong: boolean) => (
    <a
      className={`call ${strong ? 'call-strong' : ''}`}
      href={`tel:${dialable(booking.customerPhone)}`}
      aria-label={`Call ${booking.customerName ?? 'customer'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <IconPhone />
    </a>
  );

  const renderItem = (booking: BookingGroup, strong = false) =>
    booking.status !== 'confirmed' ? renderSettled(booking) : renderRich(booking, strong);

  /** Finished, missed or cancelled — nothing left to do, so it recedes. */
  const renderSettled = (booking: BookingGroup) => (
    <div className="sched-card sched-done" key={booking.key} onClick={() => setOpen(booking)}>
      <Avatar name={booking.customerName} muted />
      <div className="sched-main">
        <div className="sched-name">{booking.customerName ?? 'Unknown'}</div>
        <div className="sched-meta">{metaLine(booking)}</div>
      </div>
      <span className="status-note">{statusChip(booking).text}</span>
    </div>
  );

  const renderRich = (booking: BookingGroup, strong: boolean) => (
    <div className="sched-card" key={booking.key} onClick={() => setOpen(booking)}>
      <Avatar name={booking.customerName} />
      <div className="sched-main">
        <div className="sched-name">{booking.customerName ?? 'Unknown'}</div>
        <div className="sched-meta">{metaLine(booking)}</div>
      </div>
      {callButton(booking, strong)}
    </div>
  );

  const past = shown.slice(0, futureStart);
  const rich = shown.slice(futureStart, futureStart + RICH_GROUPS);
  const later = shown.slice(futureStart + RICH_GROUPS);

  const timelineRow = (booking: BookingGroup, quiet: boolean, strong = false) => (
    <div className="sched-group" key={booking.key}>
      <TimeCell booking={booking} timezone={timezone} />
      <div className="sched-rail">
        <span className={`sched-dot ${quiet ? 'sched-dot-quiet' : ''}`} />
        <span className="sched-thread" />
      </div>
      <div className="sched-body">{renderItem(booking, strong)}</div>
    </div>
  );

  return (
    <>
      <div className="sched">
        {past.map((b) => timelineRow(b, true))}

        {futureStart < shown.length && (
          <div className="sched-divider now-divider">
            <span className="label">{copy.home.nowLabel(formatTime(now.toISOString(), timezone))}</span>
            <span className="line" />
          </div>
        )}

        {rich.map((b, i) => timelineRow(b, false, i === 0))}

        {later.length > 0 && (
          <>
            <div className="sched-divider">
              <span className="label">{copy.home.laterLabel}</span>
              <span className="line" />
            </div>
            {later.map((b) => {
              const settled = b.status !== 'confirmed';
              return (
                <div className={`sched-lite ${settled ? 'sched-done' : ''}`} key={b.key} onClick={() => setOpen(b)}>
                  <span className="lt">{formatTime(b.startAt, timezone)}</span>
                  <span className="lr">
                    <span className="ld" />
                  </span>
                  <span className="ln">
                    {b.customerName ?? 'Unknown'} <span className="muted">· {b.serviceNames.join(' + ')}</span>
                  </span>
                  {settled ? <span className="status-note">{statusChip(b).text}</span> : callButton(b, false)}
                </div>
              );
            })}
          </>
        )}
      </div>

      {hiddenCount > 0 && (
        <a className="sched-more" href="/appointments">
          See all {bookings.length} bookings
          <IconChevronRight />
        </a>
      )}

      {open && (
        <BookingSheet
          appointment={open.appointments.find((a) => a.status === open.status) ?? open.appointments[0]!}
          timezone={timezone}
          onClose={() => setOpen(null)}
          comboServiceNames={open.isCombo ? open.serviceNames : undefined}
          comboTotalMin={open.totalMin}
        />
      )}
    </>
  );
}
