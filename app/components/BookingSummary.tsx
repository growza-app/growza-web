'use client';

import { formatMoney, formatTime, type Appointment } from '../lib/api';
import { formatDuration, type BookingGroup } from '../lib/appointment-display';
import { dialable } from './BookingSheet';
import { IconCheck, IconPhone } from './icons';

const PAYMENT_LABELS: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', other: 'Other' };

/**
 * A finished booking is a receipt, not a to-do — so tapping one shows what
 * actually happened (every service availed, its stylist, what it cost, and how
 * it was paid) instead of the confirmed booking's action sheet. Read-only.
 */
export function BookingSummary({
  booking,
  timezone,
  onClose,
}: {
  booking: BookingGroup;
  timezone: string;
  onClose: () => void;
}) {
  // What the customer actually paid; falls back to the list price for anything
  // completed before checkout recorded an amount.
  const paidOf = (a: Appointment) => a.paidAmountMinor ?? a.priceMinor ?? '0';
  const totalPaid = booking.appointments.reduce((sum, a) => sum + Number(paidOf(a)), 0);
  const paymentMode = booking.appointments.find((a) => a.paymentMode)?.paymentMode ?? null;
  const dateLine = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(new Date(booking.startAt));

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={`${booking.customerName ?? 'Booking'} summary`}>
        <div className="sheet-grab" />

        <div className="summary-head">
          <span className="summary-badge">
            <IconCheck />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="summary-title">
              {booking.customerName ?? 'Unknown'}
              <a
                className="call"
                href={`tel:${dialable(booking.customerPhone)}`}
                aria-label="Call"
                onClick={(e) => e.stopPropagation()}
              >
                <IconPhone />
              </a>
            </div>
            <div className="summary-sub">
              Finished · {dateLine} · {formatTime(booking.startAt, timezone)} · {formatDuration(booking.totalMin)}
            </div>
          </div>
        </div>

        <div className="summary-section-label">Services</div>
        {booking.appointments.map((a) => (
          <div className="summary-row" key={a.id}>
            <span className="summary-avatar">{a.serviceName.slice(0, 1).toUpperCase()}</span>
            <div className="summary-info">
              <div className="summary-service">{a.serviceName}</div>
              <div className="summary-stylist">{a.providerName ?? 'No stylist'}</div>
            </div>
            <span className="summary-price">{formatMoney(paidOf(a))}</span>
          </div>
        ))}

        <div className="summary-total">
          <span>Total paid</span>
          <span className="summary-total-value">{formatMoney(String(totalPaid))}</span>
        </div>
        {paymentMode && (
          <div className="summary-payline">
            <span>Paid by</span>
            <span>{PAYMENT_LABELS[paymentMode] ?? paymentMode}</span>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
