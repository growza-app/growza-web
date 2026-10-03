'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRef } from 'react';
import { pickNoun } from '../lib/nouns';

import { formatMoney, formatTime, type Appointment } from '../lib/api';
import { formatDateWithWeekday } from '../lib/format';
import { bookingBill, clientNameLabel, formatDuration, type BookingGroup } from '../lib/appointment-display';
import { dialable } from './BookingSheet';
import { IconCheck, IconPhone } from './icons';
import { useLabel } from './LabelsProvider';
import { useDialog } from '../../shared/a11y/useDialog';

const PAYMENT_MODE_KEYS = ['cash', 'card', 'upi', 'other'] as const;

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
  const t = useTranslations('chrome.summary');
  const tc = useTranslations('chrome');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose });
  const providerWord = pickNoun(locale, useLabel('provider', 'Staff member'), tn('staff'));
  // Jira GRW-314 — what the customer actually paid, less anything cancelled at the till, with the
  // combo's discount only where it has not already gone into a paid amount (see `bookingBill`).
  const { totalMinor: totalPaid, savingsMinor: savings } = bookingBill(booking.appointments);
  const paymentMode = booking.appointments.find((a) => a.paymentMode)?.paymentMode ?? null;
  const subtotal = totalPaid + savings;
  const pricesShown = booking.appointments.some((a) => a.priceMinor != null || a.paidAmountMinor != null);
  const paidOf = (a: Appointment) => a.paidAmountMinor ?? a.priceMinor ?? '0';
  const dateLine = formatDateWithWeekday(booking.startAt, timezone, { locale });

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t('aria', { name: booking.customerName ?? t('fallbackName') })} ref={dialogRef}>
        <div className="sheet-grab" />

        <div className="summary-head">
          <span className="summary-badge">
            <IconCheck />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="summary-title">
              {/* GRW-166 — nothing at all when the salon withholds it, and no
                  call button without a number to dial. */}
              {clientNameLabel(booking)}
              <a
                className="call"
                href={`tel:${dialable(booking.customerPhone ?? '')}`}
                aria-label={tc('call')}
                hidden={!booking.customerPhone}
                onClick={(e) => e.stopPropagation()}
              >
                <IconPhone />
              </a>
            </div>
            <div className="summary-sub">
              {t('finished')} · {dateLine} · {formatTime(booking.startAt, timezone)} · {formatDuration(booking.totalMin, locale)}
            </div>
            {booking.offerTitle && (
              <div className="summary-combo">
                <span className="chip chip-combo">🎁 {booking.offerTitle}</span>
              </div>
            )}
          </div>
        </div>

        {/* Jira GRW-480 (Q-1) — the API sends no prices to a stylist the owner keeps off the money. */}
        <div className="summary-section-label">{t('services')}</div>
        {booking.appointments.map((a) => (
          <div className="summary-row" key={a.id}>
            <span className="summary-avatar">{a.serviceName.slice(0, 1).toUpperCase()}</span>
            <div className="summary-info">
              <div className="summary-service">{a.serviceName}</div>
              <div className="summary-stylist">{a.providerName ?? t('noStaff', { label: providerWord.toLowerCase() })}</div>
            </div>
            {/* Jira GRW-314 — a service cancelled at the till is listed, but is not on the bill. */}
            {a.status === 'cancelled' ? (
              <span className="summary-price">{t('cancelled')}</span>
            ) : pricesShown ? (
              <span className="summary-price">{formatMoney(paidOf(a))}</span>
            ) : null}
          </div>
        ))}

        {pricesShown && (
        <div className="summary-totals">
          {savings > 0 && (
            <>
              <div className="summary-line">
                <span>{t('subtotal')}</span>
                <span>{formatMoney(String(subtotal))}</span>
              </div>
              <div className="summary-line">
                <span>🎁 {t('combo', { title: booking.offerTitle ?? '' })}</span>
                <span className="summary-discount">− {formatMoney(String(savings))}</span>
              </div>
            </>
          )}
          <div className="summary-line summary-line-total">
            <span>{t('total')}</span>
            <span className="summary-total-value">{formatMoney(String(totalPaid))}</span>
          </div>
          {paymentMode && (
            <div className="summary-line">
              <span>{t('paidBy')}</span>
              <span>{(PAYMENT_MODE_KEYS as readonly string[]).includes(paymentMode) ? tc(`pay.${paymentMode as (typeof PAYMENT_MODE_KEYS)[number]}`) : paymentMode}</span>
            </div>
          )}
        </div>
        )}

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {tc('close')}
          </button>
        </div>
      </div>
    </>
  );
}
