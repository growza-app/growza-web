'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api, type ServiceAdmin, type ServiceCategory } from '../lib/api';
import { servicePhotoUrl } from '../lib/service-photos';

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
  const t = useTranslations('services.form');
  const tp = useTranslations('services');
  const [name, setName] = useState(service?.name ?? '');
  const [categoryId, setCategoryId] = useState(service?.categoryId ?? '');
  const [durationMin, setDurationMin] = useState(String(service?.durationMin ?? 30));
  const [bufferAfterMin, setBufferAfterMin] = useState(String(service?.bufferAfterMin ?? 0));
  const [price, setPrice] = useState(fromMinor(service?.priceMinor ?? null));

  // Held until save. On create there is no service id to attach a photo to
  // yet, so the file is uploaded straight after the record exists — the owner
  // still only presses one button.
  const [photo, setPhoto] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState(service?.imageUrl ?? null);
  const photoRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; duration?: string; buffer?: string; price?: string }>({});

  const validate = () => {
    const next: typeof fieldErrors = {};
    if (!name.trim()) next.name = t('errors.nameRequired');
    else if (name.trim().length > 80) next.name = t('errors.nameLong');

    const d = Number(durationMin);
    if (!durationMin.trim() || !Number.isFinite(d) || d <= 0) next.duration = t('errors.durationPositive');
    else if (d > 12 * 60) next.duration = t('errors.durationMax');

    const b = Number(bufferAfterMin);
    if (bufferAfterMin.trim() && (!Number.isFinite(b) || b < 0)) next.buffer = t('errors.bufferNegative');

    if (price.trim()) {
      const p = Number(price);
      if (!Number.isFinite(p) || p < 0) next.price = t('errors.priceNegative');
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
      let saved = service ? await api.updateService(service.id, payload) : await api.createService(payload);
      if (photo) {
        const withPhoto = await api.uploadServicePhoto(saved.id, photo);
        saved = { ...saved, imageUrl: withPhoto.imageUrl };
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal modal-fit" onClick={(e) => e.stopPropagation()}>
        <h3>{service ? t('titleEdit', { name: service.name }) : t('titleAdd')}</h3>

        <div className="modal-body">
          <div className="svc-photo-field">
            {photo ? (
              <img className="svc-photo-preview" src={URL.createObjectURL(photo)} alt="" />
            ) : imageUrl ? (
              <img className="svc-photo-preview" src={servicePhotoUrl({ imageUrl, categoryName: null } as ServiceAdmin)} alt="" />
            ) : (
              <span className="svc-photo-empty svc-photo-empty-lg">{tp('photoAdd')}</span>
            )}
            <input
              ref={photoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) {
                  setError(t('errors.photoTooBig'));
                  return;
                }
                setError(null);
                setPhoto(f);
              }}
            />
            <div>
              <button type="button" className="btn btn-ghost" onClick={() => photoRef.current?.click()}>
                {photo || imageUrl ? t('changePhoto') : t('addPhoto')}
              </button>
              <div className="field-hint">{t('photoHint')}</div>
            </div>
            {(photo || imageUrl) && (
              <button
                type="button"
                className="btn btn-ghost btn-danger"
                onClick={async () => {
                  setPhoto(null);
                  if (service && imageUrl) {
                    await api.removeServicePhoto(service.id).catch(() => {});
                    setImageUrl(null);
                  }
                  if (photoRef.current) photoRef.current.value = '';
                }}
              >
                {t('remove')}
              </button>
            )}
          </div>

          <div className="field">
            <label>
              <span>{t('name')}</span>
            </label>
            <input
              type="text"
              value={name}
              autoFocus
              placeholder={t('namePlaceholder')}
              className={fieldErrors.name ? 'field-invalid' : undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: undefined }));
              }}
            />
            {fieldErrors.name && <div role="alert" className="field-error">{fieldErrors.name}</div>}
          </div>

          <div className="field">
            <label>
              <span>{t('type')}</span>
            </label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t('noType')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>
              <span>{t('duration')}</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={durationMin}
              className={fieldErrors.duration ? 'field-invalid' : undefined}
              onChange={(e) => {
                setDurationMin(e.target.value);
                if (fieldErrors.duration) setFieldErrors((f) => ({ ...f, duration: undefined }));
              }}
            />
            {fieldErrors.duration && <div role="alert" className="field-error">{fieldErrors.duration}</div>}
          </div>

          <div className="field">
            <label>
              <span>{t('cleanup')}</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={bufferAfterMin}
              className={fieldErrors.buffer ? 'field-invalid' : undefined}
              onChange={(e) => {
                setBufferAfterMin(e.target.value);
                if (fieldErrors.buffer) setFieldErrors((f) => ({ ...f, buffer: undefined }));
              }}
            />
            {fieldErrors.buffer && <div role="alert" className="field-error">{fieldErrors.buffer}</div>}
            <div className="field-hint">{t('cleanupHint')}</div>
          </div>

          <div className="field">
            <label>
              <span>{t('price')}</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              placeholder={t('pricePlaceholder')}
              className={fieldErrors.price ? 'field-invalid' : undefined}
              onChange={(e) => {
                setPrice(e.target.value);
                if (fieldErrors.price) setFieldErrors((f) => ({ ...f, price: undefined }));
              }}
            />
            {fieldErrors.price && <div role="alert" className="field-error">{fieldErrors.price}</div>}
            {service && (
              <div className="field-hint">{t('priceHint')}</div>
            )}
          </div>

          {error && <div role="alert" className="field-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={submit}>
            {busy ? t('saving') : service ? t('saveChanges') : t('addService')}
          </button>
        </div>
      </div>
    </div>
  );
}
