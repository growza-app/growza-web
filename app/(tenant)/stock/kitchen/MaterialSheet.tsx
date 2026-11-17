'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useDialog } from '../../../shared/a11y/useDialog';
import { api, ApiError } from '../../lib/api';
import type { MaterialUnit, StockMaterial } from '../../lib/api-types';
import { amount, parseAmount } from '../../lib/kitchen-units';

const UNITS: readonly MaterialUnit[] = ['kg', 'l', 'pcs'];

/**
 * Jira GRW-737 — add or change one raw material: its name, what it is counted in, a category and the level at which it is flagged low.
 * The unit is locked once stock has moved (the API refuses, and the sheet says so before anyone tries). Removing it archives it: its history
 * stays, and a recipe that uses it shows "needs fixing".
 */
export function MaterialSheet({
  material,
  branchId,
  onClose,
  onSaved,
}: {
  material: StockMaterial | null;
  branchId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('kitchenStock');
  const [name, setName] = useState(material?.name ?? '');
  const [unit, setUnit] = useState<MaterialUnit>(material?.unit ?? 'kg');
  const [category, setCategory] = useState(material?.category ?? '');
  const [lowAt, setLowAt] = useState(material && material.lowStockAt > 0 ? amount(material.lowStockAt) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  // Locked once stock has moved (FR-01) — the server says so (`moved`), so the sheet never disagrees with it (QA 2026-11-18).
  const unitLocked = material?.moved === true;
  const title = material ? t('sheetEdit') : t('sheetNew');
  const sheetRef = useRef<HTMLDivElement>(null);
  // Focus in, Tab kept inside, Escape closes, focus returns — every modal's promise.
  useDialog(sheetRef, { onClose: busy ? undefined : onClose });

  const fail = (err: unknown) =>
    setError(err instanceof ApiError ? { text: err.message, field: err.field } : { text: t('saveFailed') });

  const submit = async () => {
    if (!name.trim()) {
      setError({ text: t('nameNeeded'), field: 'name' });
      return;
    }
    const low = lowAt.trim() ? parseAmount(lowAt, unit, 'big', true) : 0;
    if (low === null) {
      setError({ text: t('badQty'), field: 'lowStockAt' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveMaterial(material?.id ?? null, {
        ...(material ? {} : { locationId: branchId }),
        name: name.trim(),
        ...(unitLocked ? {} : { unit }),
        category: category.trim() || null,
        lowStockAt: low,
      });
      onSaved();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!material) return;
    setBusy(true);
    setError(null);
    try {
      await api.archiveMaterial(material.id);
      onSaved();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div ref={sheetRef} className="modal sheet prd-sheet ks-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button type="button" className="sheet-head-cancel" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </button>
          <span className="sheet-head-title">{title}</span>
          <span className="prd-head-spacer" aria-hidden="true" />
        </div>
        <div className="sheet-body prd-form-body">
          <div className="prd-field">
            <label className="prd-field-label" htmlFor="ks-name">
              {t('name')}
            </label>
            <input
              id="ks-name"
              className="prd-input"
              value={name}
              maxLength={60}
              placeholder={t('namePh')}
              aria-invalid={error?.field === 'name' || undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <fieldset className="prd-field ks-units" disabled={unitLocked}>
            <legend className="prd-field-label">{t('unit')}</legend>
            <div className="prd-seg prd-seg-3 ks-unit-seg">
              {UNITS.map((u) => (
                <button key={u} type="button" className={unit === u ? 'is-on' : ''} aria-pressed={unit === u} onClick={() => setUnit(u)}>
                  {t(`unitName.${u}`)}
                </button>
              ))}
            </div>
            {unitLocked ? <span className="ks-hint">{t('unitLocked')}</span> : null}
          </fieldset>
          <div className="prd-field">
            <label className="prd-field-label" htmlFor="ks-category">
              {t('category')}
            </label>
            <input id="ks-category" className="prd-input" value={category} maxLength={40} placeholder={t('categoryPh')} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="prd-field">
            <label className="prd-field-label" htmlFor="ks-low">
              {t('lowAt')} ({t(`unitName.${unit}`)})
            </label>
            <input
              id="ks-low"
              className="prd-input"
              inputMode="decimal"
              value={lowAt}
              placeholder="0"
              aria-invalid={error?.field === 'lowStockAt' || undefined}
              onChange={(e) => setLowAt(e.target.value)}
            />
            <span className="ks-hint">{t('lowAtHint')}</span>
          </div>
          {error ? (
            <div role="alert" className="sheet-foot sheet-foot-error">
              {error.text}
            </div>
          ) : null}
          {material ? (
            <div className="prd-action-row prd-action-row-danger">
              <div className="prd-action-copy">
                <strong>{t('archive')}</strong>
                <span>{t('archiveHint')}</span>
              </div>
              <button type="button" className="btn btn-ghost btn-danger prd-delete-btn" disabled={busy} onClick={() => void archive()}>
                {t('archiveButton')}
              </button>
            </div>
          ) : null}
        </div>
        <div className="prd-sheet-footer">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn prd-footer-save" disabled={busy} onClick={() => void submit()}>
            {busy ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
