'use client';

import { useBookingCopy } from '../lib/use-copy';
import { useTranslations } from 'next-intl';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatTime, type Appointment, type AppointmentStatus, type Offer, type Provider, type Service } from '../lib/api';
import { formatDuration, summarizeServices } from '../lib/appointment-display';
import { CheckoutSheet } from './CheckoutSheet';
import { MoveBookingSheet } from './MoveBookingSheet';
import { IconCheck, IconClose, IconMoveTime, IconPhone, IconWhatsApp } from './icons';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Digits only — `tel:` and `wa.me` both choke on spaces and punctuation.
 *
 * GRW-199 — accepts null, because a walk-in may have given no number at all.
 * Returns an empty string, which callers test to decide whether to render a
 * call button; a `tel:` link built from nothing is a button that does nothing.
 */
export function dialable(phone: string | null | undefined): string {
  return (phone ?? '').replace(/[^0-9]/g, '');
}

/** Short human reference, derived from the appointment id exactly as the WhatsApp confirmation does. */
export function bookingRef(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

/**
 * Everything you can do to one booking, one tap deep. Kept in a sheet rather
 * than spread across each row: the schedule stays scannable, and the
 * destructive action is far from the thumb's resting position.
 */
export function BookingSheet({
  appointment,
  timezone,
  onClose,
  comboServiceNames,
  comboTotalMin,
  comboLegs,
  canSettle = true,
  canMove = true,
}: {
  appointment: Appointment;
  timezone: string;
  onClose: () => void;
  /** When this booking is a combo, every service in it — so the sheet shows the whole booking, not just one leg. */
  comboServiceNames?: string[];
  /** Total booked time across the combo's legs. */
  comboTotalMin?: number;
  /** All legs of the combo, so "Mark as done" can complete every still-booked service in one go. */
  comboLegs?: Appointment[];
  /**
   * Jira GRW-63 · GRW-195 — may this viewer settle the booking's outcome?
   *
   * False for a stylist, and it hides ALL THREE outcome actions — done, missed
   * and cancelled. Settling a booking is the record of what happened in the
   * salon, and it belongs to the owner.
   *
   * "Mark as done" is the checkout flow, and checkout sets
   * `status = 'completed'`, so it is an outcome action wearing a till's
   * clothing. Leaving it visible would have offered a stylist a button that
   * did exactly what the other two were removed for.
   *
   * Hiding matters as much as the 403 behind it: a control that answers
   * "forbidden" reads as the product being broken rather than as a boundary.
   *
   * Defaults to true, so the Home timeline (owner-only) is unaffected.
   */
  canSettle?: boolean;
  /**
   * Jira GRW-219 — may this viewer move the booking to another time?
   *
   * Two things at once, both of which have to be true. The ROLE: a stylist is
   * not on `RECEPTIONIST_ALLOWED`, for GRW-195's reason — moving a booking
   * changes the salon's day, and moving one onto a colleague's chair changes
   * theirs. And the CAPABILITY: `me.capabilities.reschedule`, so the control
   * is absent when the API would refuse it rather than present and answering
   * 403, which reads as the product being broken rather than as a boundary.
   *
   * Defaults to true so a caller that has neither answer yet is not silently
   * denied a feature — the route is the gate, this is the courtesy.
   */
  canMove?: boolean;
}) {
  const bk = useBookingCopy();
  const tc = useTranslations('chrome');
  const tsh = useTranslations('chrome.sheet');
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose });
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [moving, setMoving] = useState(false);
  const [services, setServices] = useState<Service[] | null>(null);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  // Jira GRW-314 — the combos that can be added at the till; a failed read just means none are offered.
  const [offers, setOffers] = useState<Offer[]>([]);

  const digits = dialable(appointment.customerPhone);
  const name = appointment.customerName ?? 'this customer';
  const settled = appointment.status !== 'confirmed';

  const setStatus = async (status: AppointmentStatus) => {
    setBusy(true);
    setError(null);
    try {
      // Jira GRW-318 — a cancel or a no-show is about the VISIT: a combo's other services go with the one
      // that was tapped, instead of being left confirmed beside it.
      await api.updateAppointmentStatus(appointment.id, status, status === 'cancelled' || status === 'no_show');
      router.refresh();
      onClose();
    } catch {
      setError(tsh('saveFailed'));
      setBusy(false);
    }
  };

  const openCheckout = async () => {
    setBusy(true);
    setError(null);
    try {
      const [svcs, provs, offs] = await Promise.all([services ?? api.services(), providers ?? api.providers(), api.offers().catch(() => [] as Offer[])]);
      setServices(svcs);
      setProviders(provs);
      setOffers(offs);
      setCheckingOut(true);
    } catch {
      setError(tsh('loadServicesFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (moving) {
    return (
      <MoveBookingSheet
        appointment={appointment}
        comboLegs={comboLegs}
        timezone={timezone}
        onClose={() => setMoving(false)}
        onMoved={onClose}
      />
    );
  }

  if (checkingOut && services && providers) {
    // The combo's OTHER still-booked services — completed in the same checkout
    // so one "Mark as done" finishes the whole booking, not just this leg.
    const groupMembers = (comboLegs ?? []).filter((a) => a.id !== appointment.id && a.status === 'confirmed');
    return (
      <CheckoutSheet
        appointment={appointment}
        services={services}
        providers={providers}
        offers={offers}
        groupMembers={groupMembers}
        timezone={timezone}
        onClose={() => {
          setCheckingOut(false);
          onClose();
        }}
      />
    );
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={name} ref={dialogRef}>
        <div className="sheet-grab" />

        <div className="sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sheet-title">{appointment.customerName ?? tc('unknown')}</div>
            <div className="sheet-sub">
              {comboServiceNames && comboServiceNames.length > 1
                ? `${summarizeServices(comboServiceNames)}${comboTotalMin ? ` · ${formatDuration(comboTotalMin)}` : ''}`
                : `${appointment.serviceName}${appointment.providerName ? ` · ${appointment.providerName}` : ''}`}{' '}
              · {formatTime(appointment.startAt, timezone)}
            </div>
          </div>
          <span className="ref">{bookingRef(appointment.id)}</span>
        </div>

        {error && (
          <div style={{ padding: '10px 18px 0', fontSize: 13, color: '#b91c1c' }}>{error}</div>
        )}

        {/*
          GRW-199 — no number, no contact rows.
          Same rule GRW-166 applied when a salon withholds the client's identity
          from its staff, now reached a second way: a walk-in may simply never
          have given a number. A `tel:`/`wa.me` link built from an empty string
          looks like the product is broken rather than like there is nothing to
          dial.
        */}
        {digits && (
          <>
            <a className="sheet-item" href={`tel:${digits}`}>
              <IconPhone />
              {bk.call(appointment.customerName?.split(' ')[0] ?? 'customer')}
              <span className="trail">{appointment.customerPhone}</span>
            </a>

            <a className="sheet-item" href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">
              <IconWhatsApp />
              {bk.message}
            </a>
          </>
        )}

        {!settled && canSettle && (
          <>
            <button type="button" className="sheet-item" disabled={busy} onClick={openCheckout}>
              <IconCheck />
              {bk.markFinished}
            </button>
            <button
              type="button"
              className="sheet-item sheet-neutral"
              disabled={busy}
              onClick={() => setStatus('no_show')}
            >
              <IconClose />
              {bk.markMissed}
            </button>
            {/*
              GRW-219 — the words `bk.reschedule` has carried since
              this sheet was written, finally attached to something. Above
              Cancel deliberately: moving is what a client usually wants when
              they ring, and the destructive action stays furthest from the
              thumb.
            */}
            {canMove && (
              <button type="button" className="sheet-item" disabled={busy} onClick={() => setMoving(true)}>
                <IconMoveTime />
                {bk.reschedule}
              </button>
            )}
            <button
              type="button"
              className="sheet-item sheet-danger"
              disabled={busy}
              onClick={() => setStatus('cancelled')}
            >
              <IconClose />
              {bk.cancel}
            </button>
          </>
        )}
      </div>
    </>
  );
}
