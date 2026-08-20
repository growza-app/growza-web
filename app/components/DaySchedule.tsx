'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatTime, type Appointment } from '../lib/api';
import { copy } from '../lib/copy';
import { initials, statusChip } from '../lib/appointment-display';
import { BookingSheet, dialable } from './BookingSheet';
import { IconChevronRight, IconPhone } from './icons';

/**
 * One time-ordered list for the whole day — deliberately NOT two lists.
 * A separate "happening next" section duplicates rows that also appear in
 * the day list; instead each row's weight varies by how urgent it is:
 *
 *   past + settled   -> dimmed one-liner, no actions left to take
 *   past + unmarked  -> full card, same as imminent — completing it now
 *                       goes through the checkout sheet (Booking options),
 *                       not a one-tap inline button; admin decides whenever
 *                       they get to it, there is no "you must mark this now"
 *   imminent         -> full card with call and details
 *   later today      -> compact reference row
 *
 * The "now" divider sits between past and future, so it IS the what's-next
 * signal and nothing has to be listed twice to provide one.
 */

/** How many upcoming time-groups get the full-detail treatment before the rest collapse. */
const RICH_GROUPS = 2;

interface Group {
  key: string;
  startAt: Date;
  items: Appointment[];
}

function groupByStart(appointments: Appointment[]): Group[] {
  const map = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const list = map.get(a.startAt);
    if (list) list.push(a);
    else map.set(a.startAt, [a]);
  }
  return [...map.entries()]
    .map(([key, items]) => ({ key, startAt: new Date(key), items }))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

function Avatar({ name, muted }: { name: string | null; muted?: boolean }) {
  return (
    <div className="avatar" style={muted ? { background: 'var(--slate-soft)', color: 'var(--muted)' } : undefined}>
      {initials(name)}
    </div>
  );
}

function TimeCell({ group, timezone }: { group: Group; timezone: string }) {
  const label = formatTime(group.startAt.toISOString(), timezone); // e.g. "11:30 am"
  const [clock, meridiem] = label.split(' ');
  return (
    <div className="sched-time">
      <div className="t">
        {clock} <span className="m">{meridiem}</span>
      </div>
      {group.items.length > 1 && <div className="n">{group.items.length} bookings</div>}
    </div>
  );
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
  const [open, setOpen] = useState<Appointment | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const groups = useMemo(() => groupByStart(appointments), [appointments]);

  if (appointments.length === 0) {
    return <div className="sched"><div className="empty">{copy.home.nothingToday}</div></div>;
  }

  const firstFuture = groups.findIndex((g) => g.startAt.getTime() > now.getTime());
  const futureStart = firstFuture === -1 ? groups.length : firstFuture;

  const callButton = (appt: Appointment, strong: boolean) => (
    <a
      className={`call ${strong ? 'call-strong' : ''}`}
      href={`tel:${dialable(appt.customerPhone)}`}
      aria-label={`Call ${appt.customerName ?? 'customer'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <IconPhone />
    </a>
  );

  /**
   * Status is checked BEFORE clock position, deliberately: a booking marked
   * finished or cancelled is settled no matter where it sits on the
   * timeline, and rendering it as an actionable upcoming card would invite
   * someone to act on it twice. A past-due but still-confirmed appointment
   * gets the SAME card as an upcoming one — completing/no-showing it goes
   * through Booking options (the checkout sheet), on the admin's own time,
   * not a one-tap inline prompt.
   */
  const renderItem = (appt: Appointment, strong = false) => {
    if (appt.status !== 'confirmed') return renderSettled(appt);
    return renderRich(appt, strong);
  };

  /** Finished, missed or cancelled — nothing left to do, so it recedes. */
  const renderSettled = (appt: Appointment) => (
    <div className="sched-card sched-done" key={appt.id} onClick={() => setOpen(appt)}>
      <Avatar name={appt.customerName} muted />
      <div className="sched-main">
        <div className="sched-name">{appt.customerName ?? 'Unknown'}</div>
        <div className="sched-meta">
          {appt.serviceName}
          {appt.providerName ? ` · ${appt.providerName}` : ''}
        </div>
      </div>
      <span className="status-note">{statusChip(appt).text}</span>
    </div>
  );

  const renderRich = (appt: Appointment, strong: boolean) => (
    <div className="sched-card" key={appt.id} onClick={() => setOpen(appt)}>
      <Avatar name={appt.customerName} />
      <div className="sched-main">
        <div className="sched-name">{appt.customerName ?? 'Unknown'}</div>
        <div className="sched-meta">
          {appt.serviceName}
          {appt.providerName ? ` · ${appt.providerName}` : ''}
        </div>
      </div>
      {callButton(appt, strong)}
      <button type="button" className="sched-open" aria-label="Booking options">
        <IconChevronRight />
      </button>
    </div>
  );

  const pastGroups = groups.slice(0, futureStart);
  const richGroups = groups.slice(futureStart, futureStart + RICH_GROUPS);
  const laterGroups = groups.slice(futureStart + RICH_GROUPS);

  return (
    <>
      <div className="sched">
        {pastGroups.map((g) => (
          <div className="sched-group" key={g.key}>
            <TimeCell group={g} timezone={timezone} />
            <div className="sched-rail">
              <span className="sched-dot sched-dot-quiet" />
              <span className="sched-thread" />
            </div>
            <div className="sched-body">{g.items.map((appt) => renderItem(appt))}</div>
          </div>
        ))}

        {futureStart < groups.length && (
          <div className="sched-divider now-divider">
            <span className="label">{copy.home.nowLabel(formatTime(now.toISOString(), timezone))}</span>
            <span className="line" />
          </div>
        )}

        {richGroups.map((g, i) => (
          <div className="sched-group" key={g.key}>
            <TimeCell group={g} timezone={timezone} />
            <div className="sched-rail">
              <span className="sched-dot" />
              <span className="sched-thread" />
            </div>
            <div className="sched-body">{g.items.map((appt) => renderItem(appt, i === 0))}</div>
          </div>
        ))}

        {laterGroups.length > 0 && (
          <>
            <div className="sched-divider">
              <span className="label">{copy.home.laterLabel}</span>
              <span className="line" />
            </div>
            {laterGroups.flatMap((g) =>
              g.items.map((appt) => {
                const settled = appt.status !== 'confirmed';
                return (
                  <div
                    className={`sched-lite ${settled ? 'sched-done' : ''}`}
                    key={appt.id}
                    onClick={() => setOpen(appt)}
                  >
                    <span className="lt">{formatTime(appt.startAt, timezone)}</span>
                    <span className="lr">
                      <span className="ld" />
                    </span>
                    <span className="ln">
                      {appt.customerName ?? 'Unknown'} <span className="muted">· {appt.serviceName}</span>
                    </span>
                    {settled ? (
                      <span className="status-note">{statusChip(appt).text}</span>
                    ) : (
                      callButton(appt, false)
                    )}
                  </div>
                );
              }),
            )}
          </>
        )}
      </div>

      {open && <BookingSheet appointment={open} timezone={timezone} onClose={() => setOpen(null)} />}
    </>
  );
}
