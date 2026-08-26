'use client';

import { useState } from 'react';
import { api, type ServiceAdmin, type ServiceCategory } from '../lib/api';

/** Rupees in the form, paise in the database — converted at this boundary only. */
function toMinor(rupees: string): number | null {
  const v = rupees.trim();
  if (!v) return null;
  return Math.round(Number(v) * 100);
}

function fromMinor(minor: string | null): string {
  if (minor === null) return '';
  return String(Number(minor) / 100);
}

/**
 * Add / edit one service. A modal rather than a page: the whole record is six
 * fields, and an owner correcting a price should not lose their place in the
 * list to do it.
 *
 * Editing a price is safe by construction — existing bookings carry their own
 * `booked_price_minor` (migration 0012), so a change here applies to future
 * bookings only and cannot rewrite what past customers were quoted.
 */
export function ServiceForm({
  service,
  categories,
  onClose,
  onSaved,
}: {
  /** Null to create. */
  service: ServiceAdmin | null;
  categories: ServiceCategory[];
  onClose: () => void;
  onSaved: (saved: ServiceAdmin) => void;
}) {
  const [name, setName] = useState(service?.name ?? '');
  const [categoryId, setCategoryId] = useState(service?.categoryId ?? '');
  const [durationMin, setDurationMin] = useState(String(service?.durationMin ?? 30));
  const [bufferAfterMin, setBufferAfterMin] = useState(String(service?.bufferAfterMin ?? 0));
  const [price, setPrice] = useState(fromMinor(service?.priceMinor ?? null));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; duration?: string; price?: string }>({});

  const validate = () => {
    const next: typeof fieldErrors = {};
    if (!name.trim()) next.name = 'Name is required';
    else if (name.trim().length > 80) next.name = 'Name must be 80 characters or fewer';

    const d = Number(durationMin);
    if (!durationMin.trim() || !Number.isFinite(d) || d <= 0) next.duration = 'Must be more than 0 minutes';
    else if (d > 12 * 60) next.duration = 'Must be 12 hours or less';

    if (price.trim()) {
      const p = Number(price);
      if (!Number.isFinite(p) || p < 0) next.price = 'Price cannot be negative';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim(),
      categoryId: categoryId || null,
      durationMin: Number(durationMin),
      bufferAfterMin: Number(bufferAfterMin) || 0,
      priceMinor: toMinor(price),
    };
    try {
      const saved = service ? await api.updateService(service.id, payload) : await api.createService(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{service ? `Edit ${service.name}` : 'Add a service'}</h3>

        <div className="field">
          <label>
            <span>Name *</span>
          </label>
          <input
            type="text"
            value={name}
            autoFocus
            placeholder="e.g. Haircut"
            className={fieldErrors.name ? 'field-invalid' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: undefined }));
            }}
          />
          {fieldErrors.name && <div className="field-error">{fieldErrors.name}</div>}
        </div>

        <div className="field">
          <label>
            <span>Type</span>
          </label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No type</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>
            <span>How long it takes (minutes) *</span>
          </label>
          <input
            type="number"
            min={1}
            value={durationMin}
            className={fieldErrors.duration ? 'field-invalid' : undefined}
            onChange={(e) => {
              setDurationMin(e.target.value);
              if (fieldErrors.duration) setFieldErrors((f) => ({ ...f, duration: undefined }));
            }}
          />
          {fieldErrors.duration && <div className="field-error">{fieldErrors.duration}</div>}
        </div>

        <div className="field">
          <label>
            <span>Cleanup time after (minutes)</span>
          </label>
          <input type="number" min={0} value={bufferAfterMin} onChange={(e) => setBufferAfterMin(e.target.value)} />
          <div className="field-hint">Held after the booking so the next customer isn&apos;t booked into it.</div>
        </div>

        <div className="field">
          <label>
            <span>Price (₹)</span>
          </label>
          <input
            type="number"
            min={0}
            value={price}
            placeholder="Leave blank if it varies"
            className={fieldErrors.price ? 'field-invalid' : undefined}
            onChange={(e) => {
              setPrice(e.target.value);
              if (fieldErrors.price) setFieldErrors((f) => ({ ...f, price: undefined }));
            }}
          />
          {fieldErrors.price && <div className="field-error">{fieldErrors.price}</div>}
          {service && (
            <div className="field-hint">Applies to new bookings — already-booked customers keep the price they were quoted.</div>
          )}
        </div>

        {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={busy} onClick={submit}>
            {busy ? 'Saving…' : service ? 'Save changes' : 'Add service'}
          </button>
        </div>
      </div>
    </div>
  );
}
