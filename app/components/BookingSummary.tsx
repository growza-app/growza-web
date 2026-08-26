'use client';

import { formatMoney, formatTime, type Appointment } from '../lib/api';
import { formatDateWithWeekday } from '../lib/format';
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
  const subtotal = booking.appointments.reduce((sum, a) => sum + Number(paidOf(a)), 0);
  const paymentMode = booking.appointments.find((a) => a.paymentMode)?.paymentMode ?? null;

  // Combo discount: the offer's set price for its services vs those services'
  // list prices. Only the combo legs (offerTitle set) count; add-on services
  // stay at their own price.
  const comboLegs = booking.appointments.filter((a) => a.offerTitle);
  const comboListTotal = comboLegs.reduce((sum, a) => sum + Number(a.priceMinor ?? 0), 0);
  const comboPriceMinor = comboLegs.find((a) => a.comboPriceMinor)?.comboPriceMinor;
  const savings = comboPriceMinor ? Math.max(0, comboListTotal - Number(comboPriceMinor)) : 0;
  const totalPaid = subtotal - savings;
  const dateLine = formatDateWithWeekday(booking.startAt, timezone);

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
            {booking.offerTitle && (
              <div className="summary-combo">
                <span className="chip chip-combo">🎁 {booking.offerTitle}</span>
              </div>
            )}
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

        <div className="summary-totals">
          {savings > 0 && (
            <>
              <div className="summary-line">
                <span>Subtotal</span>
                <span>{formatMoney(String(subtotal))}</span>
              </div>
              <div className="summary-line">
                <span>🎁 {booking.offerTitle} combo</span>
                <span className="summary-discount">− {formatMoney(String(savings))}</span>
              </div>
            </>
          )}
          <div className="summary-line summary-line-total">
            <span>Total paid</span>
            <span className="summary-total-value">{formatMoney(String(totalPaid))}</span>
          </div>
          {paymentMode && (
            <div className="summary-line">
              <span>Paid by</span>
              <span>{PAYMENT_LABELS[paymentMode] ?? paymentMode}</span>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
