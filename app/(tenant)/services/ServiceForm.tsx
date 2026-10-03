'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api, ApiError, type ServiceAdmin, type ServiceCategory } from '../lib/api';
import { useDialog } from '../../shared/a11y/useDialog';
import { servicePhotoUrl } from '../lib/service-photos';
import { CLEANUP, DURATION, canStep, clamp, isDirty, slotMinutes, step, type Bounds, type SheetValues } from './service-sheet';
import { durationPhrase, type DurationWords } from '../lib/duration-words';

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
 * One row of an iOS grouped form: a label on the left, its value on the right.
 */
function Row({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="sheet-row">
      <label className="sheet-row-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="sheet-row-value">{children}</div>
    </div>
  );
}

/**
 * A −/+ stepper with the number between them.
 *
 * Typing is still allowed: an owner changing 30 to 90 should not tap twelve times. The typed value is clamped
 * on blur rather than as it is typed, so deleting a digit before typing a new one is not fought.
 */
function Stepper({
  value,
  bounds,
  label,
  onChange,
  format,
  minusLabel,
  plusLabel,
}: {
  value: number;
  bounds: Bounds;
  label: string;
  onChange: (next: number) => void;
  format: (value: number) => string;
  minusLabel: string;
  plusLabel: string;
}) {
  const [typed, setTyped] = useState<string | null>(null);

  return (
    <div className="sheet-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="sheet-stepper-btn"
        aria-label={minusLabel}
        disabled={!canStep(value, -1, bounds)}
        onClick={() => onChange(step(value, -1, bounds))}
      >
        −
      </button>
      <input
        className="sheet-stepper-value"
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={typed ?? format(value)}
        onFocus={() => setTyped(String(value))}
        onChange={(e) => setTyped(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={() => {
          if (typed !== null) onChange(clamp(Number(typed), bounds));
          setTyped(null);
        }}
      />
      <button
        type="button"
        className="sheet-stepper-btn"
        aria-label={plusLabel}
        disabled={!canStep(value, 1, bounds)}
        onClick={() => onChange(step(value, 1, bounds))}
      >
        +
      </button>
    </div>
  );
}

/**
 * Add / edit one service, as an iOS grouped form (Jira GRW-440).
 *
 * It was a stack of labelled text inputs in a modal. Now: a photo row that says why a photo matters, then
 * Details, Time and Price as inset groups, then — when there is a service to act on — Retire and Delete in a
 * group of their own at the foot. Every explanation sits under its group as a footnote rather than crowding
 * the field it belongs to, which is how iOS Settings reads and why owners get through it.
 *
 * The footnote under Time is the one that earns its place: it says what the calendar actually loses, live, as
 * either stepper moves. A 45-minute service with 10 minutes cleanup takes an hour off the diary, and nothing
 * on this screen used to say so.
 *
 * Editing a price is safe by construction — existing bookings carry their own `booked_price_minor`
 * (migration 0012), so a change here applies to future bookings only.
 */
export function ServiceForm({
  service,
  categories,
  branchId,
  onClose,
  onSaved,
  onRetire,
  onRestore,
  onDelete,
}: {
  /** Jira GRW-378 — the branch this screen is showing; everything added here lands there. */
  branchId: string;
  /** Null to create. */
  service: ServiceAdmin | null;
  categories: ServiceCategory[];
  onClose: () => void;
  onSaved: (saved: ServiceAdmin) => void;
  /**
   * Jira GRW-440 — the destructive group at the foot. Handled by the list, not here: they open the same
   * confirmations the row's ··· menu opens (GRW-431), and this sheet never deletes on one tap.
   */
  onRetire?: (s: ServiceAdmin) => void;
  onRestore?: (s: ServiceAdmin) => void;
  onDelete?: (s: ServiceAdmin) => void;
}) {
  const t = useTranslations('services.form');
  const tp = useTranslations('services');

  const [name, setName] = useState(service?.name ?? '');
  const [categoryId, setCategoryId] = useState(service?.categoryId ?? '');
  // Jira GRW-473 — the stored values as they are, not clamped: a value the owner does not touch is saved unchanged.
  const [durationMin, setDurationMin] = useState(service?.durationMin ?? 30);
  const [cleanupMin, setCleanupMin] = useState(service?.bufferAfterMin ?? 0);
  const [price, setPrice] = useState(fromMinor(service?.priceMinor ?? null));

  // Held until save. On create there is no service id to attach a photo to yet, so the file is uploaded
  // straight after the record exists — the owner still only presses one button.
  const [photo, setPhoto] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState(service?.imageUrl ?? null);
  const photoRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; price?: string }>({});
  // Escape does nothing while a save is in flight, the same rule the other sheets follow.
  useDialog(sheetRef, { onClose: busy ? undefined : onClose });

  const original: SheetValues = {
    name: service?.name ?? '',
    categoryId: service?.categoryId ?? '',
    durationMin: service?.durationMin ?? 30,
    cleanupMin: service?.bufferAfterMin ?? 0,
    price: fromMinor(service?.priceMinor ?? null),
    hasNewPhoto: false,
  };
  const current: SheetValues = { name, categoryId, durationMin, cleanupMin, price, hasNewPhoto: photo !== null };
  // On create there is nothing to compare against, so Save waits only on a name.
  const canSave = service ? isDirty(current, original) : name.trim().length > 0;

  /**
   * Only the two that the steppers cannot already guarantee. Duration and cleanup are clamped by construction
   * now, so the four errors that used to exist for them have nothing left to catch.
   */
  const validate = () => {
    const next: typeof fieldErrors = {};
    if (!name.trim()) next.name = t('errors.nameRequired');
    else if (name.trim().length > 80) next.name = t('errors.nameLong');
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
      durationMin,
      bufferAfterMin: cleanupMin,
      priceMinor: toMinor(price),
    };
    try {
      let saved = service ? await api.updateService(service.id, payload) : await api.createService(branchId, payload);
      if (photo) {
        const withPhoto = await api.uploadServicePhoto(saved.id, photo);
        saved = { ...saved, imageUrl: withPhoto.imageUrl };
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.saveFailed'));
      // Jira GRW-473 — the name belongs to a retired service: offer to bring that one back instead of a dead end.
      const refusal = err instanceof ApiError ? (err.body as { existingId?: unknown; existingActive?: unknown } | null) : null;
      setRetiredMatch(refusal && typeof refusal.existingId === 'string' && refusal.existingActive === false ? refusal.existingId : null);
    } finally {
      setBusy(false);
    }
  };

  const [retiredMatch, setRetiredMatch] = useState<string | null>(null);
  const bringBack = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.updateService(id, { active: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  /*
   * Jira GRW-446 — the stepper and the footnote both say it the way a person does. "720 min" and "The slot
   * shows as 730 min" were the two the QA pass found: nobody reads a twelve-hour day as a minute count.
   */
  const words: DurationWords = {
    minutes: (count) => tp('minutes', { count }),
    hours: (count) => tp('hours', { count }),
    hoursMinutes: (hours, mins) => tp('hoursMinutes', { hours, minutes: mins }),
  };
  const minutes = (count: number) => durationPhrase(count, words);

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      {/*
        Jira GRW-446 — a dialog that behaves like every other one in the product: Escape closes it, Tab stays
        inside it, and focus comes back where it left. This was the screen's main editor and the one modal that
        did none of that; a sheet that ignores Escape is a sheet people close by clicking somewhere risky.
      */}
      <div
        className="modal sheet"
        role="dialog"
        aria-modal="true"
        aria-label={service ? t('titleEditShort') : t('titleAdd')}
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <button type="button" className="sheet-head-cancel" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </button>
          <span className="sheet-head-title">{service ? t('titleEditShort') : t('titleAdd')}</span>
          <button type="button" className="sheet-head-save" disabled={busy || !canSave} onClick={submit}>
            {busy ? t('saving') : t('save')}
          </button>
        </div>

        <div className="sheet-body">
          {/* The photo row says what a photo is FOR, which is the only reason an owner bothers to add one. */}
          <div className="sheet-group sheet-photo">
            {photo ? (
              <img className="sheet-photo-img" src={URL.createObjectURL(photo)} alt="" />
            ) : imageUrl ? (
              <img className="sheet-photo-img" src={servicePhotoUrl({ imageUrl, categoryName: null } as ServiceAdmin)} alt="" />
            ) : (
              <span className="sheet-photo-img sheet-photo-empty" aria-hidden="true" />
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
            <button type="button" className="sheet-photo-text" onClick={() => photoRef.current?.click()}>
              <span className="sheet-photo-action">{photo || imageUrl ? t('changePhoto') : t('addPhoto')}</span>
              <span className="sheet-photo-why">{t('photoHint')}</span>
            </button>
            {(photo || imageUrl) && (
              <button
                type="button"
                className="sheet-photo-remove"
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

          <div className="sheet-label">{t('groups.details')}</div>
          <div className="sheet-group">
            <Row label={t('name')} htmlFor="svc-name">
              <input
                id="svc-name"
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
            </Row>
            <Row label={t('type')} htmlFor="svc-category">
              <select id="svc-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{t('noType')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Row>
          </div>
          {fieldErrors.name && <div role="alert" className="sheet-foot sheet-foot-error">{fieldErrors.name}</div>}

          <div className="sheet-label">{t('groups.time')}</div>
          <div className="sheet-group">
            <Row label={t('duration')}>
              <Stepper
                value={durationMin}
                bounds={DURATION}
                label={t('duration')}
                onChange={setDurationMin}
                format={minutes}
                minusLabel={t('less', { field: t('duration') })}
                plusLabel={t('more', { field: t('duration') })}
              />
            </Row>
            <Row label={t('cleanup')}>
              <Stepper
                value={cleanupMin}
                bounds={CLEANUP}
                label={t('cleanup')}
                onChange={setCleanupMin}
                format={(v) => (v === 0 ? tp('noCleanup') : minutes(v))}
                minusLabel={t('less', { field: t('cleanup') })}
                plusLabel={t('more', { field: t('cleanup') })}
              />
            </Row>
          </div>
          {/* What the diary actually loses, recomputed as either stepper moves. */}
          <div className="sheet-foot">
            {t('cleanupHint')} {t('slotIs', { duration: minutes(slotMinutes(durationMin, cleanupMin)) })}
          </div>

          <div className="sheet-label">{t('groups.price')}</div>
          <div className="sheet-group">
            <div className="sheet-row sheet-row-price">
              <span className="sheet-price-symbol" aria-hidden="true">
                ₹
              </span>
              <input
                type="text"
                inputMode="decimal"
                aria-label={t('price')}
                value={price}
                placeholder={t('pricePlaceholder')}
                className={fieldErrors.price ? 'field-invalid' : undefined}
                onChange={(e) => {
                  setPrice(e.target.value);
                  if (fieldErrors.price) setFieldErrors((f) => ({ ...f, price: undefined }));
                }}
              />
            </div>
          </div>
          {fieldErrors.price && <div role="alert" className="sheet-foot sheet-foot-error">{fieldErrors.price}</div>}
          {service && !fieldErrors.price && <div className="sheet-foot">{t('priceHint')}</div>}

          {/*
            The destructive group, only when there is a service to act on. Both open the confirmations the
            list owns (GRW-431) — this sheet never retires or deletes on one tap.
          */}
          {service && (onRetire || onDelete) && (
            <>
              <div className="sheet-group sheet-group-danger">
                {service.active
                  ? onRetire && (
                      <button type="button" className="sheet-danger-row sheet-danger-warn" onClick={() => onRetire(service)}>
                        {t('retireService')}
                      </button>
                    )
                  : onRestore && (
                      <button type="button" className="sheet-danger-row" onClick={() => onRestore(service)}>
                        {t('restoreService')}
                      </button>
                    )}
                {onDelete && (
                  <button type="button" className="sheet-danger-row sheet-danger-delete" onClick={() => onDelete(service)}>
                    {t('deleteService')}
                  </button>
                )}
              </div>
              <div className="sheet-foot">{t('dangerHint')}</div>
            </>
          )}

          {error && <div role="alert" className="sheet-foot sheet-foot-error">{error}</div>}
          {retiredMatch && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void bringBack(retiredMatch)}>
              {t('bringBackRetired')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
