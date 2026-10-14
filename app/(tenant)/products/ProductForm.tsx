'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Product } from '../lib/api-types';
import { useDialog } from '../../shared/a11y/useDialog';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';
import { productPhotoUrl } from '../lib/service-photos';

/**
 * Owner, 2026-10-14 — one product, in the sheet the service form uses: a photo, a name, a price, a count.
 *
 * No minutes, no category, no staff: nobody performs a bottle. Retire / put back and Delete sit at the foot of
 * the sheet for an existing product, as on the service sheet.
 */
export function ProductForm({
  product,
  branchId,
  onSaved,
  onDelete,
  onClose,
}: {
  product: Product | null;
  branchId: string;
  onSaved: (p: Product) => void;
  onDelete: (p: Product) => void;
  onClose: () => void;
}) {
  const t = useTranslations('products.form');
  const tp = useTranslations('products');
  const tc = useTranslations('common');
  const sheetRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? String(Math.round(Number(product.priceMinor) / 100)) : '');
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [photo, setPhoto] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialog(sheetRef, { onClose: busy ? undefined : onClose });

  const rupees = Number(price);
  const canSave = name.trim().length > 0 && price.trim() !== '' && Number.isFinite(rupees) && rupees >= 0;

  const submit = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim(), priceMinor: Math.round(rupees * 100), stock: Number.isFinite(Number(stock)) ? Math.trunc(Number(stock)) : 0 };
      let saved = product ? await api.updateProduct(product.id, body) : await api.createProduct(branchId, body);
      if (photo) saved = await api.uploadProductPhoto(saved.id, photo);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  const toggleActive = async () => {
    if (!product || busy) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.updateProduct(product.id, { active: !product.active }));
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal sheet prd-sheet" role="dialog" aria-modal="true" aria-label={product ? t('titleEdit') : t('titleAdd')} ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button type="button" className="sheet-head-cancel" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </button>
          <span className="sheet-head-title">{product ? t('titleEdit') : t('titleAdd')}</span>
          <button type="button" className="sheet-head-save" disabled={busy || !canSave} onClick={() => void submit()}>
            {busy ? t('saving') : t('save')}
          </button>
        </div>
        <div className="sheet-body">
          <div className="sheet-group sheet-photo">
            {photo ? (
              <img className="sheet-photo-img" src={URL.createObjectURL(photo)} alt="" />
            ) : imageUrl ? (
              <img className="sheet-photo-img" src={productPhotoUrl({ imageUrl })} alt="" />
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
                if (f) setPhoto(f);
              }}
            />
            <button type="button" className="sheet-photo-text" onClick={() => photoRef.current?.click()}>
              <span className="sheet-photo-action">{photo || imageUrl ? t('changePhoto') : t('addPhoto')}</span>
              <span className="sheet-photo-why">{t('photoHint')}</span>
            </button>
            {photo || imageUrl ? (
              <button
                type="button"
                className="sheet-photo-remove"
                onClick={async () => {
                  setPhoto(null);
                  if (product && imageUrl) {
                    await api.removeProductPhoto(product.id).catch(() => {});
                    setImageUrl(null);
                  }
                  if (photoRef.current) photoRef.current.value = '';
                }}
              >
                {t('remove')}
              </button>
            ) : null}
          </div>

          <div className="sheet-group">
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor="prd-name">
                {t('name')}
              </label>
              <div className="sheet-row-value">
                <input id="prd-name" type="text" value={name} placeholder={t('namePlaceholder')} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus={autoFocusField(!product)} />
              </div>
            </div>
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor="prd-price">
                {t('price')}
              </label>
              <div className="sheet-row-value">
                <input id="prd-price" type="number" inputMode="numeric" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            </div>
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor="prd-stock">
                {t('stock')}
              </label>
              <div className="sheet-row-value">
                <input id="prd-stock" type="number" inputMode="numeric" step={1} value={stock} onChange={(e) => setStock(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="sheet-foot">{t('stockHint')}</div>
          {error ? (
            <div role="alert" className="sheet-foot sheet-foot-error">
              {error}
            </div>
          ) : null}

          {product ? (
            <div className="sheet-group prd-sheet-actions">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void toggleActive()}>
                {product.active ? tp('retire') : tp('bringBack')}
              </button>
              <button type="button" className="btn btn-ghost btn-danger" disabled={busy} onClick={() => onDelete(product)}>
                {tp('delete')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
