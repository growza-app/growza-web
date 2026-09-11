'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  BookingConflictError,
  formatMoney,
  type Appointment,
  type AvailabilityResponse,
  type Customer,
  type Offer,
  type Provider,
  type Service,
} from '../lib/api';
import { copy } from '../lib/copy';
import { useLabel } from './LabelsProvider';
import { PhoneField } from './PhoneField';
import { toStoredPhone, validateNationalPhone } from '../lib/phone';
import { CheckoutSheet } from './CheckoutSheet';
import { IconCheck, IconClose, IconSearch, IconUserPlus } from './icons';

/**
 * Jira GRW-199 · GRW-219 — the walk-in sheet: client first, then the booking.
 *
 * The FAB's "Walk-in now" used to open the free-times grid, on the argument
 * that a walk-in is a booking that starts now. That screen cannot book "now"
 * (the availability engine clamps every start to `now + 60min`) and refuses
 * outright when the chairs are full — which is the exact moment a walk-in flow
 * is for.
 *
 * The order of the two stages is the whole design. A salon running
 * first-come-first-serve does not need a calendar; it needs to know WHO this
 * is, because the client record is the product.
 *
 * ## A name is required and a phone is not
 *
 * The inverse of what the booking API has always asked for, and the right way
 * round for a room with a person standing in it. The salon always has something
 * to call them; it frequently has no number. A record with a number and no name
 * is a row nobody can recognise — and a mandatory phone field just produces
 * 9999999999, which collides, so every anonymous walk-in merges into one
 * fictional client.
 */

function digitsOf(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/** A picked service or combo leg, in the order it will happen. */
export interface PickedItem {
  serviceId: string;
  name: string;
  durationMin: number;
  priceMinor: string | null;
}

/** Total minutes of a chosen list — what "starts now" runs until. */
export function totalMinutes(items: PickedItem[]): number {
  return items.reduce((sum, i) => sum + i.durationMin, 0);
}

/** Sum of list prices, or the combo's fixed price when one is in play. */
export function totalMinor(items: PickedItem[], comboPriceMinor: string | null): string {
  if (comboPriceMinor) return comboPriceMinor;
  return String(items.reduce((sum, i) => sum + Number(i.priceMinor ?? 0), 0));
}

type PickedClient =
  | { kind: 'existing'; id: string; name: string | null; phone: string | null }
  | { kind: 'new'; name: string; phone: string };

type Stage =
  | { step: 'client' }
  | { step: 'newClient' }
  | { step: 'details'; client: PickedClient }
  /** `later` only — which day and which slot. A walk-in's answer is "now". */
  | { step: 'when'; client: PickedClient }
  | { step: 'saving'; client: PickedClient }
  | { step: 'done'; client: PickedClient; result: WalkInDone }
  | { step: 'error'; client: PickedClient; message: string };

interface WalkInDone {
  appointmentId: string;
  customerId: string;
  /** Every leg, in running order — the whole visit is settled in one checkout. */
  legIds: string[];
  schedulableId: string;
  startAt: string;
  overlapping: boolean;
}

function clientName(client: PickedClient): string {
  return client.kind === 'new' ? client.name : (client.name?.trim() || client.phone || '');
}

/**
 * `now` records a visit that is happening; `later` reserves a future slot.
 *
 * One sheet rather than two, because the first two questions — who is this, and
 * what are they having — are identical, and duplicating a searchable client
 * picker is how two screens start drifting apart. Only the last question and
 * the write path differ, and both differ for a stated reason: a walk-in is a
 * RECORD and never refuses, an advance booking is a RESERVATION and must.
 */
export type VisitMode = 'now' | 'later';

export function NewVisitSheet({
  onClose,
  timezone,
  mode: initialMode = 'now',
}: {
  onClose: () => void;
  timezone: string;
  mode?: VisitMode;
}) {
  /*
   * The mode is a control, not only a prop.
   *
   * It arrived as a prop because two buttons on a pop-up menu chose it before
   * the sheet opened. Those buttons are gone: the choice belongs where the
   * rest of the decision is, and a receptionist who opens "walk-in" and then
   * realises the customer wants Saturday should not have to close and reopen.
   */
  const [mode, setMode] = useState<VisitMode>(initialMode);
  const later = mode === 'later';
  const router = useRouter();
  const clientNoun = useLabel('customer', 'Client');
  const providerNoun = useLabel('provider', 'Staff member');

  const [stage, setStage] = useState<Stage>({ step: 'client' });

  // Stage 1 — find them
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);

  // Stage 1b — add them
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [nameError, setNameError] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Stage 2
  const [services, setServices] = useState<Service[] | null>(null);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [serviceTerm, setServiceTerm] = useState('');
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [comboPriceMinor, setComboPriceMinor] = useState<string | null>(null);
  const [schedulableId, setSchedulableId] = useState<string | null>(null);

  /*
   * The REAL appointment rows for this visit, fetched before checkout opens.
   *
   * The first version handed `CheckoutSheet` an object literal cast through
   * `any`, carrying only the four fields the sheet's header renders. That was
   * wrong in three visible ways at once: the total came out ₹0 (the price
   * fields were absent, so `splitComboDefaults` had nothing to seed from), the
   * stylist read "No stylist set" (`providerId` was absent), and a three-service
   * walk-in offered ONE service to pay for, because `groupMembers` was empty.
   *
   * A walk-in's whole point is capturing the money, so a till that opens at ₹0
   * and settles a third of the visit is worse than not offering it.
   */
  const [checkoutRows, setCheckoutRows] = useState<Appointment[] | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.services(), api.providers(), api.offers().catch(() => [] as Offer[])])
      .then(([svc, prov, offs]) => {
        if (cancelled) return;
        setServices(svc);
        setProviders(prov);
        setOffers(offs.filter((o) => o.active));
      })
      .catch(() => {
        /* Each picker renders its own empty state. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Debounced client search — the shape SearchClient established.
   *
   * `api.customers`, NOT `api.search`: `GET /api/v1/search` is not on the
   * receptionist's allow-list, and a receptionist is who lives in this screen.
   * The picker would have returned nothing for exactly the role it is for.
   */
  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void api
        .customers({ search: term.trim(), limit: 8 })
        .then((page) => {
          if (!cancelled) setResults(page.rows);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  const serviceById = useMemo(() => new Map((services ?? []).map((s) => [s.id, s])), [services]);

  const filteredServices = useMemo(() => {
    if (!services) return [];
    const q = serviceTerm.trim().toLowerCase();
    const pool = q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;
    return pool.slice(0, q ? 20 : 6);
  }, [services, serviceTerm]);

  /** Combos only — an offer with no fixed price is an announcement, not something to book. */
  const combos = useMemo(() => (offers ?? []).filter((o) => o.serviceIds.length > 0), [offers]);

  const addService = (s: Service) => {
    setPicked((prev) => [
      ...prev,
      { serviceId: s.id, name: s.name, durationMin: s.durationMin, priceMinor: s.priceMinor },
    ]);
    setServiceTerm('');
    // Adding a loose service means this is no longer that combo's fixed price.
    setOfferId(null);
    setComboPriceMinor(null);
  };

  const applyCombo = (offer: Offer) => {
    const items = offer.serviceIds
      .map((id) => serviceById.get(id))
      .filter((s): s is Service => Boolean(s))
      .map((s) => ({ serviceId: s.id, name: s.name, durationMin: s.durationMin, priceMinor: s.priceMinor }));
    if (items.length === 0) return;
    setPicked(items);
    setOfferId(offer.id);
    setComboPriceMinor(offer.comboPriceMinor);
    setServiceTerm('');
  };

  const removeAt = (index: number) => {
    setPicked((prev) => prev.filter((_, i) => i !== index));
    setOfferId(null);
    setComboPriceMinor(null);
  };

  // --- `later` only: which day, and which slot on it ---
  const [day, setDay] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()));
  const [slots, setSlots] = useState<AvailabilityResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotUtc, setSlotUtc] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);

  /**
   * The next seven days, in the salon's zone.
   *
   * Built from a midday anchor so a DST shift cannot roll a date backwards —
   * adding 24h to midnight lands on 23:00 the same day in a zone that springs
   * forward, and the chip row would then show the same date twice.
   */
  const days = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    const label = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric' });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + i);
      return { iso: fmt.format(d), label: i === 0 ? copy.newVisit.today : label.format(d) };
    });
  }, [timezone]);

  /*
   * Slots for the WHOLE chain, not just its first service.
   *
   * `serviceIds` repeats in the query and the API sums the chain into one span,
   * so a cut-plus-colour is only offered times where both fit on one chair.
   * Asking for the first service alone would offer 3:00 on a stylist who is
   * booked at half past, and the failure would surface as a 409 at the moment
   * of confirming — the worst possible time to find out.
   */
  useEffect(() => {
    if (!later || stage.step !== 'when' || picked.length === 0) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSlotUtc(null);
    setSlotError(null);
    void api
      .availability(picked.map((p) => p.serviceId), day, schedulableId ?? 'any')
      .then((r) => {
        if (!cancelled) setSlots(r);
      })
      .catch(() => {
        if (!cancelled) setSlots(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [later, stage.step, day, picked, schedulableId]);

  const [loadingCheckout, setLoadingCheckout] = useState(false);

  /**
   * Fetch the visit's real rows, then open the till.
   *
   * `api.appointments` is scoped to this client and today, then narrowed to the
   * exact leg ids this walk-in created — a client who already had a booking
   * earlier today must not have it swept into this checkout.
   *
   * Ordered by the legs' own order, not the API's, because the first row is the
   * one checkout settles and the others ride along as group members.
   */
  const openCheckout = async (result: WalkInDone) => {
    setLoadingCheckout(true);
    setCheckoutError(null);
    try {
      /*
       * Today AND tomorrow — a late visit runs past midnight.
       *
       * This asked for `today, today`, and QA found what that costs: a walk-in
       * recorded at 22:02 for Balayage + Haircut + Beard Trim put two of its
       * three legs after local midnight, so the fetch returned one row and the
       * till opened on the Balayage alone. ₹450 was never charged and those two
       * legs stayed `confirmed` forever — ghost bookings on tomorrow's calendar.
       *
       * It failed SILENTLY, which is the worse half: the guard below only fired
       * on an EMPTY result, so a partial one read as success.
       */
      const zoned = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
      const now = new Date();
      const all = await api.appointments(
        zoned(now),
        zoned(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
        undefined,
        result.customerId,
      );
      const byId = new Map(all.map((a) => [a.id, a]));
      const rows = result.legIds.map((id) => byId.get(id)).filter((a): a is Appointment => Boolean(a));

      /*
       * Every leg, or none — a partial till is worse than no till.
       *
       * Settling 1 of 3 legs takes a third of the money and leaves the rest
       * uncompleted with nothing on screen to say so. Refusing sends the
       * receptionist to Bookings, where the whole visit is visible and
       * settleable.
       */
      if (rows.length !== result.legIds.length) throw new Error(copy.newVisit.tillFailed);
      setCheckoutRows(rows);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : copy.newVisit.tillFailed);
    } finally {
      setLoadingCheckout(false);
    }
  };

  const submit = async (client: PickedClient) => {
    if (picked.length === 0) return;
    if (later && !slotUtc) return;
    setStage({ step: 'saving', client });
    try {
      if (later) {
        const booked = await api.createBooking({
          ...(client.kind === 'existing'
            ? { customerId: client.id }
            : { customerName: client.name, customerPhone: client.phone }),
          serviceIds: picked.map((p) => p.serviceId),
          ...(offerId ? { offerId } : {}),
          startAt: slotUtc!,
          ...(schedulableId ? { schedulableId } : {}),
        });
        router.refresh();
        setStage({
          step: 'done',
          client,
          result: {
            appointmentId: booked.appointmentId,
            customerId: booked.customerId,
            legIds: booked.appointmentIds,
            schedulableId: booked.schedulableId,
            startAt: booked.startAt,
            overlapping: false,
          },
        });
        return;
      }

      const result = await api.createWalkIn({
        ...(client.kind === 'existing'
          ? { customerId: client.id }
          : { customerName: client.name, ...(client.phone ? { customerPhone: client.phone } : {}) }),
        serviceIds: picked.map((p) => p.serviceId),
        ...(offerId ? { offerId } : {}),
        ...(schedulableId ? { schedulableId } : {}),
      });
      router.refresh();
      setStage({
        step: 'done',
        client,
        result: {
          appointmentId: result.appointmentId,
          customerId: result.customerId,
          legIds: result.legs.map((l) => l.appointmentId),
          schedulableId: result.schedulableId,
          startAt: result.startAt,
          overlapping: result.overlapping,
        },
      });
    } catch (error) {
      /*
       * Only the API's own message reaches the receptionist.
       *
       * This read `error instanceof Error ? error.message : …`, and a dropped
       * connection IS an Error — so a network failure showed the raw browser
       * string "Failed to fetch" and the written copy was never seen. Worse,
       * `saveFailed` says "That did not save… try again", which after a lost
       * RESPONSE is false and instructs the retry that duplicates the visit.
       *
       * `ApiError` means the server answered and explained itself; anything
       * else means we do not know whether it saved, and must say so.
       */
      /*
       * A taken slot is not an error to read, it is a slot to re-pick.
       *
       * `BookingConflictError` is any 409, which for an advance booking means
       * the time went while the receptionist was typing. Dropping them back on
       * the time step with the list refreshed is the scripted recovery; leaving
       * them on an error screen would make them start the client over.
       */
      if (later && error instanceof BookingConflictError) {
        setSlotUtc(null);
        setSlots(null);
        setStage({ step: 'when', client });
        setCheckoutError(null);
        setSlotError(copy.newVisit.slotTaken);
        return;
      }
      setStage({
        step: 'error',
        client,
        message: error instanceof ApiError ? error.message : copy.newVisit.saveUnknown,
      });
    }
  };

  if (checkoutRows && checkoutRows.length > 0 && services && providers) {
    /*
     * Straight into the existing till. Revenue is the owner's third outcome and
     * `CheckoutSheet` is the only money-entry UI in the app — inventing a
     * second one inside this sheet would be two save models for one number.
     *
     * The first leg is the appointment being settled and the rest are its
     * group members, exactly the shape a combo booked through WhatsApp arrives
     * in, so checkout needs no idea a walk-in is different.
     */
    const [first, ...rest] = checkoutRows;
    return (
      <CheckoutSheet
        appointment={first!}
        services={services}
        providers={providers}
        groupMembers={rest}
        timezone={timezone}
        onBack={() => setCheckoutRows(null)}
        onClose={() => {
          setCheckoutRows(null);
          onClose();
        }}
      />
    );
  }

  const busy = stage.step === 'saving';
  const headSub =
    stage.step === 'client'
      ? copy.newVisit.whoIsThis(clientNoun.toLowerCase())
      : stage.step === 'newClient'
        ? copy.newVisit.addNew
        : clientName(stage.client);

  return (
    <>
      <div className="sheet-backdrop" onClick={busy ? undefined : onClose} />
      <div className="sheet walk-in-sheet" role="dialog" aria-label={later ? copy.newVisit.laterTitle : copy.newVisit.title}>
        <div className="sheet-grab" />

        <div className="sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sheet-title">{later ? copy.newVisit.laterTitle : copy.newVisit.title}</div>
            <div className="sheet-sub">{headSub}</div>
          </div>
          <button type="button" className="wi-close" aria-label={copy.newVisit.close} onClick={onClose} disabled={busy}>
            <IconClose />
          </button>
        </div>

        {/*
          Only while the answer can still change. Once a visit is recorded or
          booked, a toggle that would silently rewrite what just happened is a
          trap, not a convenience.
        */}
        {(stage.step === 'client' || stage.step === 'newClient') && (
          <div className="wi-segmented" role="tablist" aria-label={copy.newVisit.modeLabel}>
            <button
              type="button"
              role="tab"
              aria-selected={!later}
              className={!later ? 'is-on' : ''}
              onClick={() => setMode('now')}
            >
              {copy.newVisit.modeNow}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={later}
              className={later ? 'is-on' : ''}
              onClick={() => setMode('later')}
            >
              {copy.newVisit.modeLater}
            </button>
          </div>
        )}

        {/* ---------- Stage 1: find them ---------- */}
        {stage.step === 'client' && (
          <div className="wi-body">
            <div className="picker-search">
              <span className="wi-search-icon">
                <IconSearch />
              </span>
              <input
                type="search"
                className="wi-search-input"
                placeholder={copy.newVisit.searchPlaceholder}
                value={term}
                autoFocus
                onChange={(e) => setTerm(e.target.value)}
              />
              {term !== '' && (
                <button type="button" className="search-clear-btn" onClick={() => setTerm('')} aria-label={copy.newVisit.clear}>
                  ✕
                </button>
              )}
            </div>

            {term.trim().length >= 2 && (
              <div className="picker-results">
                {results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="picker-row wi-row"
                    onClick={() =>
                      setStage({ step: 'details', client: { kind: 'existing', id: c.id, name: c.name, phone: c.waPhone } })
                    }
                  >
                    <span>
                      <span className="picker-row-name">{c.name?.trim() || copy.newVisit.noName}</span>
                      <span className="picker-row-meta"> · {c.waPhone ?? copy.newVisit.noNumber}</span>
                    </span>
                    <span className="picker-row-meta">{copy.newVisit.visits(c.totalBookings)}</span>
                  </button>
                ))}
                {!searching && results.length === 0 && <div className="empty">{copy.newVisit.noMatch}</div>}
              </div>
            )}

            <button
              type="button"
              className="wi-add-new"
              onClick={() => {
                // Seed whichever field the typed term looks like, so the
                // receptionist never types the same thing twice.
                const digits = digitsOf(term);
                if (digits.length >= 7) setNewPhone(term.trim());
                else setNewName(term.trim());
                setStage({ step: 'newClient' });
              }}
            >
              <IconUserPlus />
              {copy.newVisit.addNew}
            </button>
          </div>
        )}

        {/* ---------- Stage 1b: add them ---------- */}
        {stage.step === 'newClient' && (
          <div className="wi-body">
            <div className="field">
              <label htmlFor="wi-name">{copy.newVisit.nameRequired}</label>
              <input
                id="wi-name"
                type="text"
                autoFocus
                className={nameError ? 'field-invalid' : undefined}
                value={newName}
                placeholder={copy.newVisit.namePlaceholder}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (nameError) setNameError(false);
                }}
              />
              {nameError && <div className="field-error">{copy.newVisit.nameMissing}</div>}
            </div>

            {/*
              Required for an advance booking, optional for a walk-in.
              A different rule for a genuinely different situation: the person
              in front of you does not need reminding, and Saturday's customer
              cannot be reminded without a number. The hint says which is which
              rather than leaving the receptionist to notice.
            */}
            <PhoneField
              id="wi-phone"
              label={copy.newVisit.phoneRequired}
              required={later}
              value={newPhone}
              onChange={(v) => {
                setNewPhone(v);
                if (phoneError) setPhoneError(null);
              }}
              error={phoneError}
              hint={later ? copy.newVisit.phoneWhyLater : copy.newVisit.phoneWhy}
            />

            <div className="modal-actions wi-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStage({ step: 'client' })}>
                {copy.newVisit.back}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!newName.trim()) {
                    setNameError(true);
                    return;
                  }
                  /*
                   * A walk-in may give no number; anyone who gives one must
                   * give a real one. A half-typed number saved as-is is the
                   * shape that produced `+91786545789` in the live data.
                   */
                  const phoneProblem = validateNationalPhone(newPhone, { required: later });
                  if (phoneProblem) {
                    setPhoneError(phoneProblem);
                    return;
                  }
                  setStage({
                    step: 'details',
                    client: { kind: 'new', name: newName.trim(), phone: toStoredPhone(newPhone) ?? '' },
                  });
                }}
              >
                {copy.newVisit.useThisPerson}
              </button>
            </div>
          </div>
        )}

        {/* ---------- Stage 2: what are they having ---------- */}
        {(stage.step === 'details' || stage.step === 'saving' || stage.step === 'error') && (
          <div className="wi-body">
            {stage.step === 'error' && <div className="wi-error">{stage.message}</div>}

            {/* Chosen list first — it is the answer being assembled. */}
            {picked.length > 0 && (
              <>
                <div className="wi-section-label">{copy.newVisit.picked}</div>
                <div className="wi-picked">
                  {picked.map((item, i) => (
                    <div className="wi-picked-row" key={`${item.serviceId}-${i}`}>
                      <span className="wi-picked-name">{item.name}</span>
                      <span className="picker-row-meta">{copy.services.minutes(item.durationMin)}</span>
                      <button
                        type="button"
                        className="wi-remove"
                        aria-label={`${copy.newVisit.removeService} ${item.name}`}
                        onClick={() => removeAt(i)}
                        disabled={busy}
                      >
                        <IconClose />
                      </button>
                    </div>
                  ))}
                  <div className="wi-picked-total">
                    <span>{comboPriceMinor ? copy.newVisit.comboPrice : copy.newVisit.total}</span>
                    <strong>{formatMoney(totalMinor(picked, comboPriceMinor))}</strong>
                  </div>
                </div>
              </>
            )}

            <div className="wi-section-label">
              {picked.length > 0 ? copy.newVisit.addMore : copy.newVisit.whichService}
            </div>
            <div className="picker-search">
              <input
                type="search"
                className="wi-search-input wi-search-input-plain"
                placeholder={copy.newVisit.searchServices(services?.length ?? 0)}
                value={serviceTerm}
                onChange={(e) => setServiceTerm(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="picker-results wi-service-results">
              {filteredServices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="picker-row wi-row"
                  onClick={() => addService(s)}
                  disabled={busy}
                >
                  <span className="picker-row-name">{s.name}</span>
                  <span className="picker-row-meta">
                    {copy.services.minutes(s.durationMin)} · {formatMoney(s.priceMinor)}
                  </span>
                </button>
              ))}
              {filteredServices.length === 0 && <div className="empty">{copy.newVisit.noServiceMatch}</div>}
            </div>

            {/* Combos replace the whole list rather than appending to it — a
                combo is priced as a unit, so half of one is not a thing. */}
            {combos.length > 0 && serviceTerm.trim() === '' && (
              <>
                <div className="wi-section-label">{copy.newVisit.combos}</div>
                <div className="wi-chips">
                  {combos.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={`wi-chip wi-chip-combo ${offerId === o.id ? 'wi-chip-on' : ''}`}
                      onClick={() => applyCombo(o)}
                      disabled={busy}
                    >
                      {o.title}
                      <span className="wi-chip-meta">
                        {o.comboPriceMinor
                          ? formatMoney(o.comboPriceMinor)
                          : copy.newVisit.comboServices(o.serviceIds.length)}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="wi-section-label">{copy.newVisit.withWhom(providerNoun.toLowerCase())}</div>
            <div className="wi-chips">
              <button
                type="button"
                className={`wi-chip ${schedulableId === null ? 'wi-chip-on' : ''}`}
                onClick={() => setSchedulableId(null)}
                disabled={busy}
              >
                {copy.newVisit.whoeverIsFree}
              </button>
              {(providers ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`wi-chip ${schedulableId === p.id ? 'wi-chip-on' : ''}`}
                  onClick={() => setSchedulableId(p.id)}
                  disabled={busy}
                >
                  {p.displayName}
                </button>
              ))}
            </div>

            {picked.length > 0 && !later && (
              <div className="wi-summary">{copy.newVisit.startsNow(totalMinutes(picked))}</div>
            )}

            <div className="modal-actions wi-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStage({ step: 'client' })}
                disabled={busy}
              >
                {copy.newVisit.back}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  later ? setStage({ step: 'when', client: stage.client }) : void submit(stage.client)
                }
                disabled={busy || picked.length === 0}
              >
                {busy ? copy.newVisit.saving : later ? copy.newVisit.next : copy.newVisit.start}
              </button>
            </div>
          </div>
        )}

        {/* ---------- Stage 2b (`later` only): when ---------- */}
        {stage.step === 'when' && (
          <div className="wi-body">
            {slotError && <div className="wi-error">{slotError}</div>}
            <div className="wi-section-label">{copy.newVisit.whichDay}</div>
            <div className="wi-chips">
              {days.map((d) => (
                <button
                  key={d.iso}
                  type="button"
                  className={`wi-chip ${day === d.iso ? 'wi-chip-on' : ''}`}
                  onClick={() => setDay(d.iso)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="wi-section-label">{copy.newVisit.whichTime}</div>
            {loadingSlots ? (
              <div className="empty">{copy.newVisit.loadingTimes}</div>
            ) : !slots || slots.slotCount === 0 ? (
              <div className="empty">{copy.newVisit.noTimes}</div>
            ) : (
              /*
               * Times as a grid, not the ragged wrap the free-times screen
               * uses. That page lays slots out with `flex-wrap`, so each card
               * sizes to its own text and "9:00 AM" and "10:30 AM" produce
               * columns that do not line up. Equal columns are easier to scan
               * and the whole point of this screen is scanning.
               */
              <div className="wi-slot-grid">
                {slots.sections.flatMap((sec) =>
                  sec.slots.map((slot) => (
                    <button
                      key={slot.utc}
                      type="button"
                      className={`wi-slot ${slotUtc === slot.utc ? 'wi-slot-on' : ''}`}
                      onClick={() => setSlotUtc(slot.utc)}
                    >
                      {slot.local}
                    </button>
                  )),
                )}
              </div>
            )}

            {slotUtc && (
              <div className="wi-summary">
                {picked.map((p) => p.name).join(' + ')} · {copy.services.minutes(totalMinutes(picked))}
              </div>
            )}

            <div className="modal-actions wi-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setStage({ step: 'details', client: stage.client })}
              >
                {copy.newVisit.back}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void submit(stage.client)}
                disabled={!slotUtc}
              >
                {copy.newVisit.bookIt}
              </button>
            </div>
          </div>
        )}

        {/* ---------- Stage 3: recorded ---------- */}
        {stage.step === 'done' && (
          <div className="wi-body">
            <div className="wi-done">
              <IconCheck />
              <div>
                <div className="wi-done-title">{later ? copy.newVisit.booked : copy.newVisit.recorded}</div>
                <div className="wi-done-sub">
                  {picked.map((p) => p.name).join(' + ')} ·{' '}
                  {providers?.find((p) => p.id === stage.result.schedulableId)?.displayName ?? providerNoun}
                </div>
              </div>
            </div>

            {/*
              The overlap, said out loud.
              12-conventions.md records this as a Known gap: checkout has
              tolerated overlapping records since GRW-007 and has never told
              anybody. A calendar quietly showing two people in one chair is
              worse than a sentence explaining why.
            */}
            {stage.result.overlapping && (
              <div className="wi-overlap">
                {copy.newVisit.overlap(
                  providers?.find((p) => p.id === stage.result.schedulableId)?.displayName ?? providerNoun,
                )}
              </div>
            )}

            {/*
              No till for a future booking. Nobody has had the service and
              nobody is paying today; the money is taken from Bookings on the
              day, through the same checkout. Offering it here would invite a
              payment recorded against a visit that has not happened.
            */}
            {!later && (
              <>
                {checkoutError && <div className="wi-error">{checkoutError}</div>}
                <button
                  type="button"
                  className="sheet-item"
                  disabled={loadingCheckout}
                  onClick={() => void openCheckout(stage.result)}
                >
                  {loadingCheckout ? copy.newVisit.openingTill : copy.newVisit.takePayment}
                </button>
              </>
            )}
            <button type="button" className="sheet-item" onClick={onClose}>
              {copy.newVisit.done}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
