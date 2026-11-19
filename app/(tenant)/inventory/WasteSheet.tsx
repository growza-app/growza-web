'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useDialog } from '../../shared/a11y/useDialog';
import { api, ApiError } from '../lib/api';
import type { StockMaterial, WasteReason } from '../lib/api-types';
import { amount, parseAmount, unitWord } from '../lib/kitchen-units';

const REASONS: readonly WasteReason[] = ['spoiled', 'dropped', 'expired', 'other'];

/**
 * Jira GRW-738 — record what was thrown away: the item, how much, and why (Spoiled · Dropped · Expired · Other with a note). The cook may
 * do this; the movement carries their name. More than is left is allowed — the count goes below zero — and the sheet says so first.
 */
export function WasteSheet({
  materials,
  initialMaterialId = '',
  onClose,
  onSaved,
}: {
  materials: StockMaterial[];
  /** QA 2026-11-19 — opened from an item: that item, already picked. */
  initialMaterialId?: string;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const t = useTranslations('kitchenStock.waste');
  const tk = useTranslations('kitchenStock');
  const [materialId, setMaterialId] = useState(initialMaterialId);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<WasteReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, { onClose: busy ? undefined : onClose });

  const m = materials.find((x) => x.id === materialId) ?? null;
  const typed = m && qty.trim() ? parseAmount(qty, m.unit) : null;
  const tooMuch = m !== null && typed !== null && typed > m.stock;

  const save = async () => {
    if (!m) return setError({ text: t('pickItem'), field: 'materialId' });
    if (typed === null) return setError({ text: tk('badQty'), field: 'qty' });
    if (!reason) return setError({ text: t('pickReason'), field: 'reason' });
    if (reason === 'other' && !note.trim()) return setError({ text: t('noteNeeded'), field: 'note' });
    setBusy(true);
    setError(null);
    try {
      await api.recordWastage({ materialId: m.id, qty: typed, reason, note: note.trim() || null });
      onSaved(t('saved', { amount: amount(typed), unit: unitWord(m.unit), name: m.name }));
    } catch (err) {
      setError(err instanceof ApiError ? { text: err.message, field: err.field } : { text: tk('saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div
        ref={sheetRef}
        className="modal sheet prd-sheet ks-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <button type="button" className="sheet-head-cancel" disabled={busy} onClick={onClose}>
            {tk('cancel')}
          </button>
          <span className="sheet-head-title">{t('title')}</span>
          <span className="prd-head-spacer" aria-hidden="true" />
        </div>
        <div className="sheet-body prd-form-body">
          <div className="prd-field">
            <label className="prd-field-label" htmlFor="ks-waste-item">
              {t('item')}
            </label>
            <select
              id="ks-waste-item"
              className="prd-input ks-field"
              value={materialId}
              aria-invalid={error?.field === 'materialId' || undefined}
              onChange={(e) => setMaterialId(e.target.value)}
            >
              <option value="">{t('pickItem')}</option>
              {[...materials]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {amount(x.stock)} {unitWord(x.unit)}
                  </option>
                ))}
            </select>
          </div>
          <div className="prd-field">
            <label className="prd-field-label" htmlFor="ks-waste-qty">
              {t('qty', { unit: m ? unitWord(m.unit) : '' })}
            </label>
            <input
              id="ks-waste-qty"
              className="prd-input ks-field"
              inputMode="decimal"
              value={qty}
              placeholder="0.5"
              aria-invalid={error?.field === 'qty' || undefined}
              onChange={(e) => setQty(e.target.value)}
            />
            {tooMuch && m ? (
              <span className="rc-warn" role="status">
                {t('more', { amount: amount(m.stock), unit: unitWord(m.unit) })}
              </span>
            ) : null}
          </div>
          <fieldset className="prd-field ks-units">
            <legend className="prd-field-label">{t('reason')}</legend>
            <div className="ks-reasons">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`btn btn-ghost ${reason === r ? 'is-on' : ''}`}
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                >
                  {t(`reasons.${r}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="prd-field">
            <label className="prd-field-label" htmlFor="ks-waste-note">
              {reason === 'other' ? t('note') : t('noteOptional')}
            </label>
            <input
              id="ks-waste-note"
              className="prd-input ks-field"
              value={note}
              maxLength={200}
              placeholder={t('notePh')}
              aria-invalid={error?.field === 'note' || undefined}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error ? (
            <div role="alert" className="sheet-foot sheet-foot-error">
              {error.text}
            </div>
          ) : null}
        </div>
        <div className="prd-sheet-footer">
          {/* Jira GRW-744 — one Cancel, at the top: the foot is the one thing this sheet is for. */}
          <button type="button" className="btn prd-footer-save" disabled={busy} onClick={() => void save()}>
            {busy ? tk('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
