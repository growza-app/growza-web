'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, BookingConflictError, type AvailabilityResponse } from '../lib/api';
import { copy } from '../lib/copy';
import { PhoneField } from '../components/PhoneField';
import { fromStoredPhone, toStoredPhone, validateNationalPhone } from '../lib/phone';

type Slot = AvailabilityResponse['sections'][number]['slots'][number];

interface Props {
  sections: AvailabilityResponse['sections'];
  serviceId: string;
  serviceName: string;
  providerNames: Record<string, string>;
}

type ModalState =
  | { step: 'closed' }
  | { step: 'form'; slot: Slot }
  | { step: 'submitting'; slot: Slot }
  | { step: 'success'; slot: Slot }
  | { step: 'conflict'; slot: Slot; message: string };

interface RememberedCustomer {
  phone: string;
  name: string;
}

const REMEMBERED_CUSTOMER_KEY = 'wa-booking:rememberedCustomer';

// Changing the service/date dropdowns submits a plain <form method="get"> —
// a full page navigation, which remounts this component and would wipe any
// plain useState. sessionStorage survives that (cleared when the tab
// closes), which is exactly the right lifetime for "same walk-in customer,
// a few more services, then done."
function loadRememberedCustomer(): RememberedCustomer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(REMEMBERED_CUSTOMER_KEY);
    return raw ? (JSON.parse(raw) as RememberedCustomer) : null;
  } catch {
    return null;
  }
}

/**
 * The one clickable path from "free time" to a real row in `appointment` —
 * this is the UI half of the money moment (BKG-02/BKG-03). Client-side
 * because it drives a two-step hold-then-confirm call and needs local state
 * for the phone-number form and the pending/success/conflict outcome.
 */
export function SlotGrid({ sections, serviceId, serviceName, providerNames }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>({ step: 'closed' });
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [name, setName] = useState('');
  // Remembered across bookings (and across the page navigations changing
  // service/date causes) so "book another service for this customer"
  // doesn't make the admin retype the phone number.
  const [rememberedCustomer, setRememberedCustomer] = useState<RememberedCustomer | null>(loadRememberedCustomer);
  /**
   * Slots the owner has picked to quote. The page used to end at a wall of
   * times with nothing to do but book one — but the common move is answering
   * "when are you free?" with two or three options, which meant retyping them
   * into WhatsApp by hand. Selection turns the grid into that reply.
   */
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSlot = (utc: string) =>
    setSelected((prev) => (prev.includes(utc) ? prev.filter((u) => u !== utc) : [...prev, utc]));

  const allSlots = sections.flatMap((sec) => sec.slots);
  // Keep the owner's tap order, not grid order — the first one picked is the
  // one the Book button offers, which is what they reached for first.
  const selectedSlots = selected.map((utc) => allSlots.find((s) => s.utc === utc)).filter(Boolean) as Slot[];

  /**
   * Opens WhatsApp with the times pre-written and no recipient, so the owner
   * picks the chat. We deliberately do not guess a customer here — Free times
   * is answered for whoever happens to be asking.
   */
  const sendOnWhatsApp = () => {
    const times = selectedSlots.map((s) => s.local).join(', ');
    const text =
      selectedSlots.length === 1
        ? `Hi! I can fit you in for ${serviceName} at ${times}. Shall I book it?`
        : `Hi! I have these times free for ${serviceName}: ${times}. Which suits you?`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const providerName = (id: string | null) => (id ? (providerNames[id] ?? '—') : '—');

  const rememberCustomer = (customer: RememberedCustomer) => {
    setRememberedCustomer(customer);
    sessionStorage.setItem(REMEMBERED_CUSTOMER_KEY, JSON.stringify(customer));
  };

  const openBooking = (slot: Slot) => {
    setPhone(fromStoredPhone(rememberedCustomer?.phone) || (rememberedCustomer?.phone ?? ''));
    setName(rememberedCustomer?.name ?? '');
    setModal({ step: 'form', slot });
  };

  const forgetCustomer = () => {
    setRememberedCustomer(null);
    sessionStorage.removeItem(REMEMBERED_CUSTOMER_KEY);
    setPhone('');
    setName('');
  };

  const submit = async () => {
    if (modal.step !== 'form') return;
    // GRW-199 — one shape for every number in the app. A half-typed one saved
    // as-is is how `+91786545789` got into the live customer table.
    const phoneProblem = validateNationalPhone(phone);
    if (phoneProblem) {
      setPhoneError(phoneProblem);
      return;
    }
    const { slot } = modal;
    setModal({ step: 'submitting', slot });

    try {
      const hold = await api.createHold(serviceId, slot.utc, slot.assignedProviderId ?? undefined);
      await api.confirmAppointment({
        holdKey: hold.holdKey,
        serviceId,
        startAt: slot.utc,
        customerPhone: toStoredPhone(phone)!,
        customerName: name.trim() || undefined,
      });
      rememberCustomer({ phone, name: name.trim() });
      setModal({ step: 'success', slot });
      router.refresh(); // the booked slot should vanish from the free-times list
    } catch (error) {
      const message = error instanceof BookingConflictError ? error.message : 'Something went wrong. Please try again.';
      setModal({ step: 'conflict', slot, message });
    }
  };

  const close = () => setModal({ step: 'closed' });

  return (
    <>
      {sections.map((section) => (
        <div key={section.section}>
          {sections.length > 1 && <div className="section-label">{sectionLabel(section.section)}</div>}
          <div className="slot-grid">
            {section.slots.map((slot) => (
              <button
                key={slot.utc}
                type="button"
                aria-pressed={selected.includes(slot.utc)}
                className={`slot slot-clickable ${selected.includes(slot.utc) ? 'slot-selected' : ''}`}
                onClick={() => toggleSlot(slot.utc)}
              >
                {slot.local}
                <small>{providerName(slot.assignedProviderId)}</small>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* The page now ends in an action instead of a wall of times. Appears
          only once something is selected, so the default view is unchanged. */}
      {selectedSlots.length > 0 && (
        <div className="slot-actions">
          <div className="slot-actions-count">
            {selectedSlots.length} {selectedSlots.length === 1 ? 'time' : 'times'} selected
            <button type="button" className="link-btn" onClick={() => setSelected([])}>
              Clear
            </button>
          </div>
          <div className="slot-actions-buttons">
            <button type="button" className="btn" onClick={sendOnWhatsApp}>
              Send {selectedSlots.length} {selectedSlots.length === 1 ? 'time' : 'times'} on WhatsApp
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => openBooking(selectedSlots[0]!)}>
              Book {selectedSlots[0]!.local}
            </button>
          </div>
        </div>
      )}

      {modal.step !== 'closed' && (
        <div className="modal-backdrop" onClick={modal.step === 'form' ? close : undefined}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {(modal.step === 'form' || modal.step === 'submitting') && (
              <>
                <h3>
                  {serviceName} · {modal.slot.local}
                </h3>
                <p className="muted">{providerName(modal.slot.assignedProviderId)}</p>

                <PhoneField
                  id="phone"
                  label="Phone number"
                  required
                  value={phone}
                  onChange={(v) => {
                    setPhone(v);
                    if (phoneError) setPhoneError(null);
                  }}
                  error={phoneError}
                  disabled={modal.step === 'submitting'}
                />
                <div className="field">
                  <label htmlFor="name">Name (optional)</label>
                  <input
                    id="name"
                    type="text"
                    placeholder="Customer's name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={modal.step === 'submitting'}
                  />
                </div>
                {rememberedCustomer && (
                  <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
                    Booking another service for this customer.{' '}
                    <button type="button" className="link-btn" onClick={forgetCustomer}>
                      Not them? Clear
                    </button>
                  </p>
                )}

                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={close} disabled={modal.step === 'submitting'}>
                    Cancel
                  </button>
                  <button className="btn" onClick={submit} disabled={modal.step === 'submitting' || phone.length === 0}>
                    {modal.step === 'submitting' ? 'Booking…' : 'Confirm booking'}
                  </button>
                </div>
              </>
            )}

            {modal.step === 'success' && (
              <>
                <h3>Booked ✓</h3>
                <p className="muted">
                  {serviceName} at {modal.slot.local} with {providerName(modal.slot.assignedProviderId)}.
                </p>
                <p className="muted" style={{ fontSize: 13.5 }}>
                  Want to book another service for the same customer? Pick a different service above, then choose a
                  time — their phone number will already be filled in.
                </p>
                <div className="modal-actions">
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      forgetCustomer();
                      close();
                    }}
                  >
                    Different customer
                  </button>
                  <button className="btn" onClick={close}>
                    Done
                  </button>
                </div>
              </>
            )}

            {modal.step === 'conflict' && (
              <>
                <h3>Couldn&apos;t book that</h3>
                <p className="muted">{modal.message}</p>
                <div className="modal-actions">
                  <button
                    className="btn"
                    onClick={() => {
                      close();
                      router.refresh();
                    }}
                  >
                    Show free times again
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function sectionLabel(s: string): string {
  if (s === 'Morning') return copy.freeTimes.morning;
  if (s === 'Afternoon') return copy.freeTimes.afternoon;
  if (s === 'Evening') return copy.freeTimes.evening;
  return s;
}
