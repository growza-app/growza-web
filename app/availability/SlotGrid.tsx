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

  const providerName = (id: string | null) => (id ? (providerNames[id] ?? '—') : '—');

  const openBooking = (slot: Slot) => {
    setPhone('');
    setName('');
    setModal({ step: 'form', slot });
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
                <div className="modal-actions">
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
