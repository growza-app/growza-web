'use client';

import { useBookingCopy } from '../lib/use-copy';
import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatTime, type Appointment, type AppointmentStatus, type Offer, type Provider, type Service } from '../lib/api';
import { formatDuration, summarizeServices } from '../lib/appointment-display';
import { CheckoutSheet } from './CheckoutSheet';
import { MoveBookingSheet } from './MoveBookingSheet';
import { IconCheck, IconClose, IconMoveTime, IconPhone, IconWhatsApp } from './icons';
import { useDialog } from '../../shared/a11y/useDialog';
import { useMayUse } from './SessionProvider';

/**
 * A `tel:` number — `+` and digits, nothing else: `tel:` chokes on spaces and punctuation.
 *
 * Owner-app audit 2026-10-10 — the `+` stays. This stripped it, so the booking card and the action sheet dialled
 * `tel:919876543207` while the client profile dialled `tel:+919876543207`; without the `+` a handset treats the
 * twelve digits as a local number and the call does not connect. `wa.me` wants the digits alone — that is
 * `waDigits` below, and the two are named for the link they build so nobody swaps them again.
 *
 * GRW-199 — accepts null, because a walk-in may have given no number at all.
 * Returns an empty string, which callers test to decide whether to render a
 * call button; a `tel:` link built from nothing is a button that does nothing.
 */
export function dialable(phone: string | null | undefined): string {
  const digits = waDigits(phone);
  if (!digits) return '';
  return (phone ?? '').trim().startsWith('+') ? `+${digits}` : digits;
}

/** The digits a `wa.me/` link wants — no `+`, no spaces. */
export function waDigits(phone: string | null | undefined): string {
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
   * Jira GRW-219 — is moving a booking switched on for this business?
   *
   * The CAPABILITY half only (`me.capabilities.reschedule`), so the control is
   * absent when the API would refuse it rather than present and answering 403.
   * The ROLE half is the sheet's own question now (Jira GRW-409, below): a
   * caller used to pass `!viewerIsStaff && …`, and a caller that forgot to was
   * a stylist with a Move button.
   *
   * Defaults to true so a caller that has no answer yet is not silently denied
   * a feature — the route is the gate, this is the courtesy.
   */
  canMove?: boolean;
}) {
  const locale = useLocale();
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
  /*
   * Owner-app audit, 2026-10-10 — Cancel and "Client didn't come" each acted on one tap, and both are final: a settled
   * booking cannot be put back (Jira GRW-467). Cancel sits at the bottom under the thumb; didn't-come sits one row
   * above Move, the button a client ringing usually wants. So the first tap asks and the second does it. "Keep the
   * booking" takes the focus, so Enter or a stray second tap keeps it.
   */
  const [asking, setAsking] = useState<'cancelled' | 'no_show' | null>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) keepRef.current?.focus();
  }, [asking]);
  /** The question in place of the button: what happens, Keep (focused), and Yes. */
  const askFirst = (status: 'cancelled' | 'no_show', question: string, yes: string) => (
    <div className="bk-cancel-ask" role="group" aria-labelledby={`bk-ask-${status}`}>
      <p id={`bk-ask-${status}`} className="bk-cancel-q">
        {question}
      </p>
      <button ref={keepRef} type="button" className="sheet-item" disabled={busy} onClick={() => setAsking(null)}>
        <IconCheck />
        {bk.cancelKeep}
      </button>
      <button type="button" className="sheet-item sheet-danger" disabled={busy} onClick={() => setStatus(status)}>
        <IconClose />
        {yes}
      </button>
    </div>
  );
  const [services, setServices] = useState<Service[] | null>(null);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  // Jira GRW-314 — the combos that can be added at the till; a failed read just means none are offered.
  const [offers, setOffers] = useState<Offer[]>([]);
  /**
   * Jira GRW-63 · GRW-195 · GRW-409 — which outcome actions this viewer may use, asked of the shared rule.
   *
   * A stylist gets none of the three — done, missed, cancelled. Settling a booking is the record of what
   * happened in the salon. "Mark as done" is the checkout flow, and checkout sets `status = 'completed'`, so it
   * is an outcome action wearing a till's clothing: `booking.checkout` names that route, and a role without it
   * is not offered the button that would have done exactly what the other two were removed for.
   *
   * Decided here, from the session, rather than passed in: `canSettle={!viewerIsStaff}` was a prop every
   * caller had to remember, and a control that answers "forbidden" reads as the product being broken.
   */
  const mayCheckout = useMayUse('booking.checkout');
  const maySetStatus = useMayUse('booking.setStatus');
  // A booking whose service has since been deleted has no duration to look times up for, so it cannot be moved.
  const mayMove = useMayUse('booking.reschedule') && canMove && (comboLegs ?? [appointment]).every((l) => l.serviceId !== null);

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
    // Jira GRW-392 (review) — the visit's branch's people, plus whoever is already on one of its lines (a stylist
    // who has since moved branch still did the work). Another branch's stylist would be refused at Mark done.
    const onVisit = new Set([appointment.providerId, ...groupMembers.map((a) => a.providerId)].filter(Boolean));
    const tillProviders = providers.filter((p) => !appointment.locationId || !p.locationId || p.locationId === appointment.locationId || onVisit.has(p.id));
    return (
      <CheckoutSheet
        appointment={appointment}
        services={services}
        providers={tillProviders}
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
      <div className="sheet bk-sheet" role="dialog" aria-modal="true" aria-label={name} ref={dialogRef}>
        <div className="sheet-grab" />

        <div className="sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sheet-title">{appointment.customerName ?? tc('unknown')}</div>
            <div className="sheet-sub">
              {comboServiceNames && comboServiceNames.length > 1
                ? `${summarizeServices(comboServiceNames, locale)}${comboTotalMin ? ` · ${formatDuration(comboTotalMin, locale)}` : ''}`
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
        <div className="bk-sheet-actions">
          {digits && (
            <>
              <a className="sheet-item" href={`tel:${digits}`}>
                <IconPhone />
                {bk.call(appointment.customerName?.split(' ')[0] ?? 'customer')}
                <span className="trail">{appointment.customerPhone}</span>
              </a>

              <a className="sheet-item" href={`https://wa.me/${waDigits(appointment.customerPhone)}`} target="_blank" rel="noopener noreferrer">
                <IconWhatsApp />
                {bk.message}
              </a>
            </>
          )}

          {!settled && (
            <>
              {mayCheckout && (
                <button type="button" className="sheet-item" disabled={busy} onClick={openCheckout}>
                  <IconCheck />
                  {bk.markFinished}
                </button>
              )}
              {maySetStatus && (
                <>
                  {asking === 'no_show' ? (
                    askFirst('no_show', bk.noShowAsk, bk.noShowYes)
                  ) : (
                    <button type="button" className="sheet-item sheet-neutral" disabled={busy} onClick={() => setAsking('no_show')}>
                      <IconClose />
                      {bk.markMissed}
                    </button>
                  )}
                </>
              )}
              {/*
                GRW-219 — the words `bk.reschedule` has carried since
                this sheet was written, finally attached to something. Above
                Cancel deliberately: moving is what a client usually wants when
                they ring, and the destructive action stays furthest from the
                thumb.
              */}
              {mayMove && (
                <button type="button" className="sheet-item" disabled={busy} onClick={() => setMoving(true)}>
                  <IconMoveTime />
                  {bk.reschedule}
                </button>
              )}
              {maySetStatus && (
                <>
                  {asking === 'cancelled' ? (
                    askFirst('cancelled', bk.cancelAsk, bk.cancelYes)
                  ) : (
                    <button type="button" className="sheet-item sheet-danger" disabled={busy} onClick={() => setAsking('cancelled')}>
                      <IconClose />
                      {bk.cancel}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
