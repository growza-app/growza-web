'use client';

import { useMoveCopy, useNewVisitCopy } from '../lib/use-copy';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  formatTime,
  reasonOr,
  type Appointment,
  type AvailabilityResponse,
  type Provider,
} from '../lib/api';
import { zonedDateTimeToUtc } from '../lib/zoned-time';
import { useLabel } from './LabelsProvider';
import { IconClose } from './icons';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Jira GRW-219 — moving a booking to another time.
 *
 * ## Why it offers free slots AND a free-text time
 *
 * A slot grid alone would be the restriction the owner rejected. The
 * availability endpoint clamps to `minNoticeMin: 60` and only ever returns
 * times nobody is on — so at 3:30 PM, with the salon running late, "move
 * Priya's 3 o'clock to a quarter to four" would simply not be offerable. That
 * is the everyday case, not the edge one.
 *
 * So the grid is the fast path and `Another time` is the escape, and the
 * engine tolerates a clash rather than refusing it (`reschedule.ts`).
 *
 * ## The clash is named BEFORE the save
 *
 * This is the one place the move sheet deliberately differs from the walk-in
 * sheet. A walk-in's overlap is a fact already standing in the room, reported
 * after the event. A future overlap is a CHOICE the receptionist is making, so
 * it is named while they can still change their mind and the button changes
 * its own words to say what it is about to do.
 *
 * Computed here from the day's own bookings rather than from the response,
 * because the response arrives too late to be a warning.
 */
export function MoveBookingSheet({
  appointment,
  comboLegs,
  timezone,
  onClose,
  onMoved,
}: {
  /** Any leg of the visit — the whole booking group moves. */
  appointment: Appointment;
  /** Every leg, when this is a combo, so the span being moved is the whole visit. */
  comboLegs?: Appointment[];
  timezone: string;
  onClose: () => void;
  onMoved: () => void;
}) {
  const mv = useMoveCopy();
  const nv = useNewVisitCopy();
  const tc = useTranslations('chrome');
  const router = useRouter();
  const providerNoun = useLabel('provider', 'Staff member');

  const legs = useMemo(
    () => (comboLegs && comboLegs.length > 0 ? comboLegs : [appointment]),
    [comboLegs, appointment],
  );

  /** The whole visit's span — first leg's start to last leg's end. */
  const spanMin = useMemo(() => {
    const starts = legs.map((l) => new Date(l.startAt).getTime());
    const ends = legs.map((l) => new Date(l.endAt).getTime());
    return Math.round((Math.max(...ends) - Math.min(...starts)) / 60_000);
  }, [legs]);

  const [day, setDay] = useState(() =>
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()),
  );
  const [providerId, setProviderId] = useState<string | null>(null);
  const [slotUtc, setSlotUtc] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState('');
  const [slots, setSlots] = useState<AvailabilityResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [dayBookings, setDayBookings] = useState<Appointment[]>([]);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose: busy ? undefined : onClose });
  const [error, setError] = useState<string | null>(null);

  /**
   * The next seven days, in the salon's zone.
   *
   * Anchored at midday so a DST shift cannot roll a date backwards — adding
   * 24h to midnight lands on 23:00 the same day in a zone that springs
   * forward, and the chip row would then show the same date twice. Same
   * construction as the walk-in sheet's, and for the same reason.
   */
  const days = useMemo(() => {
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    const label = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
    });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + i);
      return { iso: iso.format(d), label: i === 0 ? nv.today : label.format(d) };
    });
  }, [timezone]);

  useEffect(() => {
    let cancelled = false;
    void api
      .providers()
      .then((r) => {
        // Jira GRW-379 — the visit's own branch: another branch sells its own copy of the service, at its own
        // price, so a move there is refused. Cancel and book there instead.
        const here = appointment.locationId;
        if (!cancelled) setProviders(r.filter((p) => !here || !p.locationId || p.locationId === here));
      })
      .catch(() => {
        // The chip row disappears and the booking keeps its stylist, which is
        // the safe outcome — never a row of names that cannot be trusted.
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [appointment.locationId]);

  /*
   * Free times for the WHOLE visit, so a combo is only offered slots it fits
   * in.
   *
   * `serviceId` repeats in the query and the API sums the chain into one span
   * — asking about the first service alone would offer 3:00 on a stylist who
   * is booked at half past, and the failure would surface at the moment of
   * confirming. The same reasoning the walk-in sheet's "later" mode records.
   */
  const serviceIds = useMemo(() => legs.flatMap((l) => (l.serviceId ? [l.serviceId] : [])), [legs]);

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true);
    setSlotUtc(null);
    void api
      .availability(serviceIds, day, providerId ?? appointment.providerId ?? 'any')
      .then((r) => {
        if (!cancelled) setSlots(r);
      })
      .catch(() => {
        // The grid shows its empty state and `Another time` still works —
        // which is the point of having both.
        if (!cancelled) setSlots(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [day, providerId, serviceIds, appointment.providerId]);

  /* That day's bookings, for the clash warning. */
  useEffect(() => {
    let cancelled = false;
    void api
      .appointments(day, day)
      .then((r) => {
        if (!cancelled) setDayBookings(r);
      })
      .catch(() => {
        if (!cancelled) setDayBookings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [day]);

  const targetProviderId = providerId ?? appointment.providerId;

  /** The instant being moved to — from the grid, or from the typed time. */
  const chosenStart = useMemo(() => {
    if (slotUtc) return new Date(slotUtc);
    if (customTime) return zonedDateTimeToUtc(day, customTime, timezone);
    return null;
  }, [slotUtc, customTime, day, timezone]);

  /**
   * Who else is on that chair then — named, not merely counted.
   *
   * "That time is taken" leaves the receptionist with nothing to do next;
   * "Anjali already has someone at that time" is a fact they can act on, the
   * same reasoning GRW-218's duplicate-number refusal is built on.
   *
   * ## It compares customer-facing times, and therefore under-warns
   *
   * The engine decides the real overlap against `appointment_allocation.during`,
   * which includes each service's turnaround buffers; this compares the times a
   * person sees, because those are the only ones the API hands the browser.
   *
   * So a move into somebody else's ten-minute buffer warns about nothing and
   * still lands `released` — reported afterwards instead of before. Under-
   * warning is the right direction to be wrong in: the move succeeds either
   * way, and a warning that fired on gaps a receptionist considers empty would
   * be trained away within a week.
   */
  const clash = useMemo(() => {
    if (!chosenStart || !targetProviderId) return null;
    const from = chosenStart.getTime();
    const to = from + spanMin * 60_000;
    const movingIds = new Set(legs.map((l) => l.id));
    const hit = dayBookings.find(
      (b) =>
        b.status === 'confirmed' &&
        b.providerId === targetProviderId &&
        !movingIds.has(b.id) &&
        new Date(b.startAt).getTime() < to &&
        new Date(b.endAt).getTime() > from,
    );
    if (!hit) return null;
    const who = providers.find((p) => p.id === targetProviderId)?.displayName;
    return who ? mv.clash(who) : mv.clashUnknown;
  }, [chosenStart, targetProviderId, spanMin, dayBookings, legs, providers]);

  const save = async () => {
    if (!chosenStart) return;
    setBusy(true);
    setError(null);
    try {
      await api.rescheduleAppointment(appointment.id, {
        startAt: chosenStart.toISOString(),
        schedulableId: providerId,
      });
      router.refresh();
      onMoved();
    } catch (e) {
      // Jira GRW-478 — `instanceof Error` let a dropped connection's "Failed to fetch" through as if the server said it.
      setError(reasonOr(e, mv.failed));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={busy ? undefined : onClose} />
      <div className="sheet move-sheet" role="dialog" aria-modal="true" aria-label={mv.title} ref={dialogRef}>
        <div className="sheet-grab" />

        <div className="sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sheet-title">{mv.title}</div>
            <div className="sheet-sub">
              {appointment.customerName ?? tc('unknown')} · {formatTime(appointment.startAt, timezone)}
            </div>
          </div>
          <button type="button" className="wi-close" aria-label={nv.close} onClick={onClose} disabled={busy}>
            <IconClose />
          </button>
        </div>

        <div className="wi-body">
          {error && <div role="alert" className="wi-error">{error}</div>}

          <div className="wi-section-label">{mv.whichDay}</div>
          <div className="wi-chips mv-days">
            {days.map((d) => (
              <button
                key={d.iso}
                type="button"
                className={`wi-chip ${day === d.iso ? 'wi-chip-on' : ''}`}
                disabled={busy}
                onClick={() => setDay(d.iso)}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="wi-section-label">{mv.whichTime}</div>
          {loadingSlots ? (
            <div className="empty">{mv.loadingTimes}</div>
          ) : !slots || slots.slotCount === 0 ? (
            <div className="empty">{mv.noTimes}</div>
          ) : (
            <div className="wi-slot-grid">
              {slots.sections.flatMap((sec) =>
                sec.slots.map((slot) => (
                  <button
                    key={slot.utc}
                    type="button"
                    className={`wi-slot ${slotUtc === slot.utc ? 'wi-slot-on' : ''}`}
                    disabled={busy}
                    onClick={() => {
                      setSlotUtc(slot.utc);
                      setCustomTime('');
                    }}
                  >
                    {slot.local}
                  </button>
                )),
              )}
            </div>
          )}

          {/*
            The escape hatch, and the reason this sheet is not just the free-times
            screen in a drawer. See the note at the top of the file.
          */}
          <div className="wi-section-label">{mv.anotherTime}</div>
          <div className="mv-any-time">
            <input
              type="time"
              value={customTime}
              disabled={busy}
              aria-label={mv.anotherTime}
              onChange={(e) => {
                setCustomTime(e.target.value);
                setSlotUtc(null);
              }}
            />
            <span className="mv-any-hint">{mv.anotherTimeHint}</span>
          </div>

          {providers.length > 0 && (
            <>
              <div className="wi-section-label">{mv.withWhom(providerNoun.toLowerCase())}</div>
              <div className="wi-chips">
                <button
                  type="button"
                  className={`wi-chip ${providerId === null ? 'wi-chip-on' : ''}`}
                  disabled={busy}
                  onClick={() => setProviderId(null)}
                >
                  {mv.keepStylist}
                </button>
                {providers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`wi-chip ${providerId === p.id ? 'wi-chip-on' : ''}`}
                    disabled={busy}
                    onClick={() => setProviderId(p.id)}
                  >
                    {p.displayName}
                  </button>
                ))}
              </div>
            </>
          )}

          {clash && <div className="mv-clash">{clash}</div>}

          <div className="modal-actions wi-actions">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
              {mv.back}
            </button>
            <button type="button" className="btn" disabled={busy || !chosenStart} onClick={() => void save()}>
              {busy ? mv.saving : clash ? mv.confirmAnyway : mv.confirm}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
