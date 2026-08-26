'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { formatMoney, formatTime, type Appointment } from '../lib/api';
import { copy } from '../lib/copy';
import { formatDuration, groupBookings, statusChip, summarizeServices, type BookingGroup } from '../lib/appointment-display';
import { BookingSheet, dialable } from '../components/BookingSheet';
import { BookingSummary } from '../components/BookingSummary';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import { IconCalendar, IconCheck, IconClock, IconMenu, IconPhone, IconStaff, IconUserPlus, IconWallet } from '../components/icons';

/** What the salon actually took for a booking: services paid, minus any combo discount. */
function bookingTotalMinor(b: BookingGroup): number {
  const subtotal = b.appointments.reduce((sum, a) => sum + Number(a.paidAmountMinor ?? a.priceMinor ?? 0), 0);
  const comboLegs = b.appointments.filter((a) => a.offerTitle);
  const comboList = comboLegs.reduce((sum, a) => sum + Number(a.priceMinor ?? 0), 0);
  const comboPrice = comboLegs.find((a) => a.comboPriceMinor)?.comboPriceMinor;
  const savings = comboPrice ? Math.max(0, comboList - Number(comboPrice)) : 0;
  return subtotal - savings;
}

// `value` widened to string so the revenue tile can carry a formatted amount alongside the plain counts.
function Kpi({ tone, icon, value, label, sub }: { tone: string; icon: ReactNode; value: number | string; label: string; sub: string }) {
  return (
    <div className="bk-kpi">
      <span className={`bk-kpi-icon bk-kpi-${tone}`}>{icon}</span>
      <div className="bk-kpi-text">
        <div className="bk-kpi-value">{value}</div>
        <div className="bk-kpi-label">{label}</div>
        <div className={`bk-kpi-sub bk-kpi-sub-${tone}`}>{sub}</div>
      </div>
    </div>
  );
}

/**
 * The bookings page: a "today" dashboard — headline counts, then the day's
 * schedule as a timeline (or a compact list), then a revenue summary. A combo /
 * multi-service booking is ONE row showing every service and the total time.
 */
export function BookingsList({
  appointments,
  timezone,
  noun,
  nowISO,
  isToday,
  dayLabel,
}: {
  appointments: Appointment[];
  timezone: string;
  noun: string;
  /** Server clock, so the first client render matches SSR before the tick starts. */
  nowISO: string;
  /** Whether the selected day (the filter's date field) is today. */
  isToday: boolean;
  /** Short label for the selected day, e.g. "21 Aug" — used everywhere the page said "Today" when it's actually showing a different day. */
  dayLabel: string;
}) {
  const [now, setNow] = useState(() => new Date(nowISO));
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'timeline' | 'list'>('timeline');
  const [open, setOpen] = useState<BookingGroup | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const bookings = groupBookings(appointments);

  const within2h = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= now.getTime() && t <= now.getTime() + 2 * 60 * 60 * 1000;
  };
  const completed = bookings.filter((b) => b.status === 'completed');
  const confirmed = bookings.filter((b) => b.status === 'confirmed');
  // "Next 2 hrs" only means something against the real clock, i.e. on today's
  // schedule. Looking at a past/future day, show the day's total confirmed
  // count instead — "next 2 hours" would silently read 0 for every other day.
  const comingUp = isToday ? confirmed.filter((b) => within2h(b.startAt)).length : confirmed.length;
  const noShow = bookings.filter((b) => b.status === 'no_show').length;
  const revenue = completed.reduce((sum, b) => sum + bookingTotalMinor(b), 0);

  const pageCount = Math.max(1, Math.ceil(bookings.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);
  const rows = bookings.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);

  const openBooking = (b: BookingGroup) => setOpen(b);

  const actionFor = (b: BookingGroup) =>
    b.status === 'confirmed' ? (
      <a
        className="call"
        href={`tel:${dialable(b.customerPhone)}`}
        aria-label={`Call ${b.customerName ?? 'customer'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <IconPhone />
      </a>
    ) : (
      <button
        type="button"
        className="btn btn-ghost bk-details"
        onClick={(e) => {
          e.stopPropagation();
          openBooking(b);
        }}
      >
        <IconCalendar />
        Details
      </button>
    );

  const cardInner = (b: BookingGroup) => {
    const chip = statusChip(b);
    return (
      <div className="bk-card" onClick={() => openBooking(b)}>
        <div className="bk-card-left">
          <div className="bk-card-name">{b.customerName ?? 'Unknown'}</div>
          {b.offerTitle && (
            <div className="bk-card-combo">
              <span className="chip chip-combo">🎁 {b.offerTitle}</span>
            </div>
          )}
          <div className="bk-card-services">{summarizeServices(b.serviceNames)}</div>
          {b.providerNames.length > 0 && (
            <div className="bk-card-staff">
              <IconStaff />
              {b.providerNames.join(', ')}
            </div>
          )}
        </div>
        <div className="bk-card-right">
          <span className={`chip ${chip.cls}`}>{chip.text}</span>
          {actionFor(b)}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="bk-kpis">
        <Kpi tone="green" icon={<IconCalendar />} value={bookings.length} label="Bookings" sub={isToday ? 'Today' : dayLabel} />
        <Kpi
          tone="amber"
          icon={<IconClock />}
          value={comingUp}
          label={copy.status.confirmed}
          sub={isToday ? 'Next 2 hrs' : dayLabel}
        />
        <Kpi tone="purple" icon={<IconCheck />} value={completed.length} label={copy.status.done} sub={isToday ? 'Today' : dayLabel} />
        <Kpi tone="red" icon={<IconUserPlus />} value={noShow} label={copy.status.didNotCome} sub={isToday ? 'Today' : dayLabel} />
        {/* Revenue belongs with the other numbers for the day, not stranded
            below the list where it read as a footnote to the last booking. */}
        <Kpi
          tone="green"
          icon={<IconWallet />}
          value={formatMoney(String(revenue))}
          label="Revenue"
          sub={isToday ? 'Today' : dayLabel}
        />
      </div>

      <div className="bk-sched-head">
        <h3>{isToday ? "Today's schedule" : `${dayLabel} schedule`}</h3>
        <div className="bk-view">
          <button
            type="button"
            className={`bk-view-icon ${view === 'list' ? 'is-active' : ''}`}
            onClick={() => setView('list')}
            aria-label="List view"
          >
            <IconMenu />
          </button>
          <button
            type="button"
            className="bk-view-pill"
            onClick={() => setView((v) => (v === 'timeline' ? 'list' : 'timeline'))}
            aria-label="Switch view"
          >
            {view === 'timeline' ? 'Timeline' : 'List'}
            <span className="bk-view-caret" aria-hidden="true">⌄</span>
          </button>
        </div>
      </div>

      <div className="bk-scroll">
      {view === 'timeline' ? (
        <div className="bk-timeline">
          {rows.map((b, i) => {
            const [clock, meridiem] = formatTime(b.startAt, timezone).split(' ');
            return (
              <div className="bk-tl-row" key={b.key}>
                <div className="bk-tl-time">
                  <div className="bk-tl-clock">
                    {clock}
                    <span>{meridiem}</span>
                  </div>
                  <div className="bk-tl-dur">{formatDuration(b.totalMin)}</div>
                </div>
                <div className="bk-tl-rail">
                  <span className={`bk-tl-dot ${b.status === 'confirmed' ? 'is-up' : ''}`} />
                  {i < rows.length - 1 && <span className="bk-tl-line" />}
                </div>
                {cardInner(b)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bk-list">{rows.map((b) => cardInner(b))}</div>
      )}
      </div>

      <Pagination page={clamped} total={bookings.length} pageSize={PAGE_SIZE} noun={noun} onChange={setPage} />

      {open &&
        (open.status === 'completed' ? (
          <BookingSummary booking={open} timezone={timezone} onClose={() => setOpen(null)} />
        ) : (
          <BookingSheet
            appointment={open.appointments.find((a) => a.status === open.status) ?? open.appointments[0]!}
            timezone={timezone}
            onClose={() => setOpen(null)}
            comboServiceNames={open.isCombo ? open.serviceNames : undefined}
            comboTotalMin={open.totalMin}
            comboLegs={open.isCombo ? open.appointments : undefined}
          />
        ))}
    </>
  );
}
