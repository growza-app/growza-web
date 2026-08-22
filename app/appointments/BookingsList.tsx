'use client';

import { useState } from 'react';
import { formatMoney, formatTime, type Appointment } from '../lib/api';
import { initials, statusChip } from '../lib/appointment-display';
import { BookingSheet, dialable } from '../components/BookingSheet';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import { IconPhone } from '../components/icons';

/**
 * The day's bookings. Desktop shows a scannable table; mobile shows the same
 * rows as cards — a six-column table can't be read on a phone without pinch-
 * zooming, and the design language is cards everywhere on mobile (matches
 * Clients). Both share ONE page slice and the shared numbered Pagination.
 *
 * Tapping a row/card opens the BookingSheet (call, message, reschedule, mark
 * done, cancel); the Call action is also surfaced inline on each upcoming card,
 * because chasing a likely no-show is the owner's most time-critical move.
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
  const [open, setOpen] = useState<Appointment | null>(null);

  const pageCount = Math.max(1, Math.ceil(appointments.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount);
  const rows = appointments.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);

  const callButton = (appt: Appointment) => (
    <a
      className="call"
      href={`tel:${dialable(appt.customerPhone)}`}
      aria-label={`Call ${appt.customerName ?? 'customer'}`}
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
            {rows.map((appt) => {
              const chip = statusChip(appt);
              return (
                <tr key={appt.id} data-row onClick={() => setOpen(appt)} style={{ cursor: 'pointer' }}>
                  <td>{formatTime(appt.startAt, timezone)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="avatar">{initials(appt.customerName)}</span>
                      <span style={{ fontWeight: 620 }}>{appt.customerName ?? 'Unknown'}</span>
                    </div>
                  </td>
                  <td>{appt.serviceName}</td>
                  <td className="muted">{appt.providerName ?? '—'}</td>
                  <td>{formatMoney(appt.priceMinor)}</td>
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
        {rows.map((appt) => {
          const chip = statusChip(appt);
          const [clock, meridiem] = formatTime(appt.startAt, timezone).split(' ');
          return (
            <div className="booking-card" key={appt.id} data-row onClick={() => setOpen(appt)}>
              <div className="booking-time">
                {clock}
                <span>{meridiem}</span>
              </div>
              <div className="booking-main">
                <div className="booking-name">
                  <span className="booking-name-text">{appt.customerName ?? 'Unknown'}</span>
                  <span className={`chip ${chip.cls}`}>{chip.text}</span>
                </div>
                <div className="booking-sub">
                  {appt.serviceName}
                  {appt.providerName ? ` · ${appt.providerName}` : ''}
                </div>
              </div>
              {appt.status === 'confirmed' && callButton(appt)}
            </div>
          );
        })}
      </div>

      <Pagination page={clamped} total={appointments.length} pageSize={PAGE_SIZE} noun={noun} onChange={setPage} />

      {open && <BookingSheet appointment={open} timezone={timezone} onClose={() => setOpen(null)} />}
    </>
  );
}
