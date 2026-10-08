'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { pickNoun } from '../lib/nouns';

import { api, formatMoney, formatTime, type Appointment, type BookingCorrection, type Service } from '../lib/api';
import { formatDateWithWeekday } from '../lib/format';
import { bookingBill, clientNameLabel, formatDuration, type BookingGroup } from '../lib/appointment-display';
import { dialable } from './BookingSheet';
import { CorrectBookingSheet } from './CorrectBookingSheet';
import { IconCheck, IconEdit, IconPackages, IconPhone } from './icons';
import { useMayUse } from './SessionProvider';
import { useLabel } from './LabelsProvider';
import { useDialog } from '../../shared/a11y/useDialog';

const PAYMENT_MODE_KEYS = ['cash', 'card', 'upi', 'other'] as const;

/**
 * A finished booking is a receipt, not a to-do — so tapping one shows what
 * actually happened (every service availed, its stylist, what it cost, and how
 * it was paid) instead of the confirmed booking's action sheet. Read-only — except that the owner may correct a
 * wrong amount or service after the fact (`booking.correct`).
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
  const tfix = useTranslations('chrome.correct');
  const mayCorrect = useMayUse('booking.correct');
  const [services, setServices] = useState<Service[] | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [corrections, setCorrections] = useState<BookingCorrection[]>([]);
  const firstId = booking.appointments[0]?.id;
  // The owner sees what was changed on a finished visit, so a figure that moved is never a mystery. A failed read
  // just shows nothing: the receipt above is still right.
  useEffect(() => {
    if (!mayCorrect || !firstId) return;
    let live = true;
    api.bookingCorrections(firstId).then((r) => live && setCorrections(r.corrections), () => {});
    return () => {
      live = false;
    };
  }, [mayCorrect, firstId]);
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

  const openCorrect = async () => {
    setLoadFailed(false);
    try {
      setServices(services ?? (await api.services()));
      setCorrecting(true);
    } catch {
      setLoadFailed(true);
    }
  };

  if (correcting && services) {
    return (
      <CorrectBookingSheet
        appointment={booking.appointments[0]!}
        legs={booking.appointments.filter((a) => a.status === 'completed')}
        services={services}
        timezone={timezone}
        onClose={() => {
          setCorrecting(false);
          onClose();
        }}
      />
    );
  }

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
                <span className="chip chip-combo"><IconPackages /> {booking.offerTitle}</span>
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
                <span><IconPackages /> {t('combo', { title: booking.offerTitle ?? '' })}</span>
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

        {corrections.length > 0 && (
          <>
            <div className="summary-section-label">{tfix('historyTitle')}</div>
            {corrections.map((c) => (
              <div className="summary-correction" key={c.at}>
                <div className="summary-correction-when">
                  {formatDateWithWeekday(c.at, timezone, { locale, withYear: false })} · {formatTime(c.at, timezone)}
                </div>
                {c.changes.map((ch) => (
                  <div className="summary-line" key={ch.appointmentId}>
                    <span>
                      {ch.beforeService && ch.afterService && ch.beforeService !== ch.afterService
                        ? `${ch.beforeService} → ${ch.afterService}`
                        : (ch.afterService ?? ch.beforeService ?? '')}
                    </span>
                    <span>
                      {ch.beforeMinor !== null ? `${formatMoney(String(ch.beforeMinor))} → ` : ''}
                      {formatMoney(String(ch.afterMinor))}
                    </span>
                  </div>
                ))}
                {c.reason && <div className="summary-correction-reason">{c.reason}</div>}
              </div>
            ))}
          </>
        )}

        {loadFailed && (
          <div role="alert" style={{ padding: '10px 0 0', fontSize: 13, color: '#b91c1c' }}>
            {tfix('loadFailed')}
          </div>
        )}

        <div className="modal-actions summary-actions">
          {mayCorrect && booking.appointments.some((a) => a.status === 'completed') && (
            <button type="button" className="btn btn-ghost" onClick={openCorrect}>
              <IconEdit />
              {tfix('item')}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {tc('close')}
          </button>
        </div>
      </div>
    </>
  );
}
