'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useDialog } from '../../shared/a11y/useDialog';
import { api, ApiError, formatMoney } from '../lib/api';
import type { MaterialUnit, StockMaterial } from '../lib/api-types';
import { amount, parseAmount, unitWord } from '../lib/kitchen-units';
import { MaterialHistory } from './MaterialHistory';
import { MaterialPrices } from './MaterialPrices';

const UNITS: readonly MaterialUnit[] = ['kg', 'l', 'pcs'];

/**
 * Jira GRW-737 — add or change one raw material: its name, what it is counted in, a category and the level at which it is flagged low.
 * The unit is locked once stock has moved (the API refuses, and the sheet says so before anyone tries). Removing it archives it: its history
 * stays, and a recipe that uses it shows "needs fixing".
 *
 * Jira GRW-738 — and its recent history, for everyone who opens it: `readOnly` is the counter's and the cook's sheet, the amount and the
 * history with nothing to change. The average cost shows only where the API sent it.
 *
 * Jira GRW-744 FR-04 — an item opens to what it IS: its amount, large, then its price, its low level and its history. The form is behind
 * Edit (the menu's people only); before, tapping an item to see how much was left dropped the owner into a form. One Cancel, at the top.
 *
 * Jira GRW-743 FR-04 — an item with no price yet (only ever an opening count) can be given one here, once. It values what the item was
 * used for so far, so the food cost counts those dishes; after that a stock in moves it.
 */
export function MaterialSheet({
  material,
  branchId,
  readOnly = false,
  onClose,
  onSaved,
}: {
  material: StockMaterial | null;
  branchId: string;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('kitchenStock');
  const locale = useLocale();
  const [name, setName] = useState(material?.name ?? '');
  const [unit, setUnit] = useState<MaterialUnit>(material?.unit ?? 'kg');
  const [category, setCategory] = useState(material?.category ?? '');
  const [lowAt, setLowAt] = useState(material && material.lowStockAt > 0 ? amount(material.lowStockAt) : '');
  const [busy, setBusy] = useState(false);
  // A new item starts in the form; an existing one opens to its amount.
  const [editingNow, setEditingNow] = useState(material === null);
  const [price, setPrice] = useState('');
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  // Locked once stock has moved (FR-01) — the server says so (`moved`), so the sheet never disagrees with it (QA 2026-11-18).
  const unitLocked = material?.moved === true;
  const title = !material ? t('sheetNew') : editingNow ? t('sheetEdit') : material.name;
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

  // Rupees as typed ("240", "6.50") to paise; null when it is not a price.
  const savePrice = async () => {
    if (!material) return;
    const rupees = Number(price.trim().replace(/[₹,\s]/g, ''));
    if (!price.trim() || !Number.isFinite(rupees) || rupees < 1 || rupees > 100_000) {
      setError({ text: t('price.bad'), field: 'priceMinor' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveMaterial(material.id, { priceMinor: Math.round(rupees * 100) });
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
          {/* An existing item's form goes back to the item; anything else closes the sheet. */}
          <button type="button" className="sheet-head-cancel" disabled={busy} onClick={material && editingNow ? () => { setEditingNow(false); setError(null); } : onClose}>
            {editingNow ? t('cancel') : t('close')}
          </button>
          <span className="sheet-head-title">{title}</span>
          {material && !editingNow && !readOnly ? (
            <button type="button" className="sheet-head-cancel ks-head-edit" onClick={() => setEditingNow(true)}>
              {t('edit')}
            </button>
          ) : (
            <span className="prd-head-spacer" aria-hidden="true" />
          )}
        </div>
        <div className="sheet-body prd-form-body">
          {material && !editingNow ? (
            <>
              <div className={`ks-hero ${material.stock < 0 ? 'is-below' : material.low ? 'is-low' : ''}`}>
                <strong className="ks-hero-amount">{material.stock < 0 ? t('noneLeft') : `${amount(material.stock)} ${unitWord(material.unit)}`}</strong>
                <span className="ks-hero-note">
                  {material.stock < 0
                    ? t('overUsed', { amount: amount(-material.stock), unit: unitWord(material.unit) })
                    : material.lowStockAt > 0
                      ? t(material.low ? 'lowNow' : 'lowAtLine', { amount: amount(material.lowStockAt), unit: unitWord(material.unit) })
                      : t('neverFlagged')}
                </span>
                {typeof material.avgCost === 'number' ? (
                  <span className="ks-meta">{t('history.avgCost', { cost: formatMoney(material.avgCost, 'INR', locale), unit: t(`perUnit.${material.unit}`) })}</span>
                ) : null}
              </div>
              {/* GRW-743 FR-04 — `avgCost: null` is sent only to whoever may see the money; the form only to whoever may change the item. */}
              {!readOnly && 'avgCost' in material && material.avgCost === null ? (
                <div className="prd-field ks-price">
                  <label className="prd-field-label" htmlFor="ks-price">
                    {t('price.label', { unit: t(`perUnit.${material.unit}`) })}
                  </label>
                  <span className="ks-hint">{t('price.hint')}</span>
                  <div className="ks-price-row">
                    <input
                      id="ks-price"
                      className="prd-input"
                      inputMode="decimal"
                      placeholder={t('price.ph')}
                      value={price}
                      aria-invalid={error?.field === 'priceMinor' || undefined}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                    <button type="button" className="btn" disabled={busy} onClick={() => void savePrice()}>
                      {busy ? t('saving') : t('price.save')}
                    </button>
                  </div>
                  {error ? (
                    <div role="alert" className="sheet-foot sheet-foot-error">
                      {error.text}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          {readOnly || !editingNow ? null : (
            <>
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
                <input
                  id="ks-category"
                  className="prd-input"
                  value={category}
                  maxLength={40}
                  placeholder={t('categoryPh')}
                  onChange={(e) => setCategory(e.target.value)}
                />
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
            </>
          )}
          {/* Jira GRW-739 — the price trend, for whoever the API sends a cost to (it leaves `avgCost` out for everyone else). */}
          {material && !editingNow && 'avgCost' in material ? <MaterialPrices materialId={material.id} unit={material.unit} /> : null}
          {material && !editingNow ? <MaterialHistory materialId={material.id} unit={material.unit} /> : null}
          {material && !readOnly && editingNow ? (
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
        {readOnly || !editingNow ? null : (
          // Jira GRW-744 — one Cancel, at the top: the foot is the one thing this sheet is for.
          <div className="prd-sheet-footer">
            <button type="button" className="btn prd-footer-save" disabled={busy} onClick={() => void submit()}>
              {busy ? t('saving') : t('save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
