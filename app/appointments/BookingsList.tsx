'use client';

import { useState } from 'react';
import { formatMoney, formatTime, type Appointment } from '../lib/api';
import { formatDuration, groupBookings, initials, statusChip, summarizeServices, type BookingGroup } from '../lib/appointment-display';
import { BookingSheet, dialable } from '../components/BookingSheet';
import { BookingSummary } from '../components/BookingSummary';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import { IconPhone } from '../components/icons';

/**
 * The day's bookings. A combo / multi-service booking is ONE booking, not one
 * row per service: its legs (same `bookingGroupId`) collapse into a single item
 * that shows every service and the total time booked (e.g. Haircut + Facial +
 * De-Tan · 1h 30m). Desktop shows a table, mobile shows cards — same data.
 *
 * Tapping opens the BookingSheet (call, message, reschedule, mark done, cancel)
 * on the booking's first leg; the Call action is also inline on each upcoming
 * card, because chasing a likely no-show is the owner's most time-critical move.
 */
export function BookingsList({
  appointments,
  timezone,
  noun,
}: {
  appointments: Appointment[];
  timezone: string;
  /** Lowercase plural, e.g. "bookings" — for the "Showing 1–10 of 24" line. */
  noun: string;
}) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<BookingGroup | null>(null);

  const bookings = groupBookings(appointments);
  const pageCount = Math.max(1, Math.ceil(bookings.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);
  const rows = bookings.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);

  const callButton = (b: (typeof rows)[number]) => (
    <a
      className="call"
      href={`tel:${dialable(b.customerPhone)}`}
      aria-label={`Call ${b.customerName ?? 'customer'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <IconPhone />
    </a>
  );

  return (
    <>
      <div className="table-scroll booking-table">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Customer</th>
              <th>Service</th>
              <th>Staff</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const chip = statusChip(b);
              return (
                <tr key={b.key} onClick={() => setOpen(b)} style={{ cursor: 'pointer' }}>
                  <td>
                    <div>{formatTime(b.startAt, timezone)}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{formatDuration(b.totalMin)}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="avatar">{initials(b.customerName)}</span>
                      <span style={{ fontWeight: 620 }}>{b.customerName ?? 'Unknown'}</span>
                    </div>
                  </td>
                  <td>{summarizeServices(b.serviceNames)}</td>
                  <td className="muted">{b.providerNames.join(', ') || '—'}</td>
                  <td>{formatMoney(String(b.priceMinor))}</td>
                  <td>
                    <span className={`chip ${chip.cls}`}>{chip.text}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="booking-cards">
        {rows.map((b) => {
          const chip = statusChip(b);
          const [clock, meridiem] = formatTime(b.startAt, timezone).split(' ');
          return (
            <div className="booking-card" key={b.key} onClick={() => setOpen(b)}>
              <div className="booking-time">
                {clock}
                <span>{meridiem}</span>
                <span className="booking-dur">{formatDuration(b.totalMin)}</span>
              </div>
              <div className="booking-main">
                <div className="booking-name">
                  <span className="booking-name-text">{b.customerName ?? 'Unknown'}</span>
                  <span className={`chip ${chip.cls}`}>{chip.text}</span>
                </div>
                <div className="booking-sub">{summarizeServices(b.serviceNames)}</div>
                {b.providerNames.length > 0 && <div className="booking-sub booking-staff">{b.providerNames.join(', ')}</div>}
              </div>
              {b.status === 'confirmed' && callButton(b)}
            </div>
          );
        })}
      </div>

      <Pagination page={clamped} total={bookings.length} pageSize={PAGE_SIZE} noun={noun} onChange={setPage} />

      {open &&
        (open.status === 'completed' ? (
          // A finished booking is a receipt: show the services availed, their
          // stylists and prices — not the confirmed booking's action sheet.
          <BookingSummary booking={open} timezone={timezone} onClose={() => setOpen(null)} />
        ) : (
          <BookingSheet
            // Open on the leg whose status matches the booking as a whole, so the
            // sheet's actions line up with the badge: a combo whose first service
            // is already done but the rest still upcoming reads "Coming", and the
            // sheet must still offer Mark-done / cancel — not the settled view of
            // that first finished leg.
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
