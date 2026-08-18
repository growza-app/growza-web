'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, BookingConflictError, type AvailabilityResponse } from '../lib/api';
import { copy } from '../lib/copy';

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
  const [name, setName] = useState('');
  // Remembered across bookings (and across the page navigations changing
  // service/date causes) so "book another service for this customer"
  // doesn't make the admin retype the phone number.
  const [rememberedCustomer, setRememberedCustomer] = useState<RememberedCustomer | null>(loadRememberedCustomer);

  const providerName = (id: string | null) => (id ? (providerNames[id] ?? '—') : '—');

  const rememberCustomer = (customer: RememberedCustomer) => {
    setRememberedCustomer(customer);
    sessionStorage.setItem(REMEMBERED_CUSTOMER_KEY, JSON.stringify(customer));
  };

  const openBooking = (slot: Slot) => {
    setPhone(rememberedCustomer?.phone ?? '');
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
    const { slot } = modal;
    setModal({ step: 'submitting', slot });

    try {
      const hold = await api.createHold(serviceId, slot.utc, slot.assignedProviderId ?? undefined);
      await api.confirmAppointment({
        holdKey: hold.holdKey,
        serviceId,
        startAt: slot.utc,
        customerPhone: phone.trim(),
        customerName: name.trim() || undefined,
      });
      rememberCustomer({ phone: phone.trim(), name: name.trim() });
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
              <button key={slot.utc} className="slot slot-clickable" onClick={() => openBooking(slot)}>
                {slot.local}
                <small>{providerName(slot.assignedProviderId)}</small>
              </button>
            ))}
          </div>
        </div>
      ))}

      {modal.step !== 'closed' && (
        <div className="modal-backdrop" onClick={modal.step === 'form' ? close : undefined}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {(modal.step === 'form' || modal.step === 'submitting') && (
              <>
                <h3>
                  {serviceName} · {modal.slot.local}
                </h3>
                <p className="muted">{providerName(modal.slot.assignedProviderId)}</p>

                <div className="field">
                  <label htmlFor="phone">Phone number</label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={modal.step === 'submitting'}
                  />
                </div>
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
                  <button className="btn" onClick={submit} disabled={modal.step === 'submitting' || !phone.trim()}>
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
