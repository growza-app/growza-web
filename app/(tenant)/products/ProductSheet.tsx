'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Product, ProductCategory } from '../lib/api-types';
import { useDialog } from '../../shared/a11y/useDialog';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';
import { productPhotoUrl } from '../lib/service-photos';
import { StockPanel } from './StockPanel';
import { SalesPanel } from './SalesPanel';
import { stockTone } from './ProductsList';

/**
 * Owner, 2026-10-14 — one product, in the sheet the service form uses, in two parts:
 *
 * - **Details** — photo, name, price, cost price (so the margin is on the screen), the low-stock line, and for a
 *   new product its opening count. Retire / put back and Delete at the foot, as on the service sheet.
 * - **Stock** (an existing product only) — the count, five reasons it changes, and the ledger (0116). Typing
 *   over the count is deliberately NOT offered here: every change says why.
 */
type Part = 'details' | 'stock' | 'sales';

export function ProductSheet({
  product,
  branchId,
  categories,
  onSaved,
  onDelete,
  onClose,
  inline = false,
}: {
  product: Product | null;
  branchId: string;
  /** 0117 — the branch's own categories, for the Details part's picker. */
  categories: readonly ProductCategory[];
  onSaved: (p: Product) => void;
  onDelete: (p: Product) => void;
  onClose: () => void;
  /** The wide desk draws the sheet in its right panel: no backdrop, no dialog, and a save keeps it open. */
  inline?: boolean;
}) {
  const t = useTranslations('products.form');
  const tp = useTranslations('products');
  const tc = useTranslations('common');
  const sheetRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [part, setPart] = useState<Part>('details');
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? String(Math.round(Number(product.priceMinor) / 100)) : '');
  const [cost, setCost] = useState(product?.costMinor != null ? String(Math.round(Number(product.costMinor) / 100)) : '');
  const [lowAt, setLowAt] = useState(product && product.lowStockAt > 0 ? String(product.lowStockAt) : '');
  const [categoryId, setCategoryId] = useState<string>(product?.categoryId ?? '');
  const [stock, setStock] = useState('0');
  const [photo, setPhoto] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialog(sheetRef, { onClose: busy || inline ? undefined : onClose });

  const rupees = Number(price);
  const costRupees = cost.trim() === '' ? null : Number(cost);
  const canSave = name.trim().length > 0 && price.trim() !== '' && Number.isFinite(rupees) && rupees >= 0 && (costRupees === null || (Number.isFinite(costRupees) && costRupees >= 0));
  const marginPct = costRupees !== null && rupees > 0 && Number.isFinite(costRupees) ? Math.round(((rupees - costRupees) / rupees) * 100) : null;

  const fail = (err: unknown) => setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));

  const submit = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        priceMinor: Math.round(rupees * 100),
        costMinor: costRupees === null ? null : Math.round(costRupees * 100),
        lowStockAt: lowAt.trim() === '' ? 0 : Math.max(0, Math.trunc(Number(lowAt)) || 0),
        categoryId: categoryId || null,
      };
      let saved = product
        ? await api.updateProduct(product.id, body)
        : await api.createProduct(branchId, {
            ...body,
            stock: Math.trunc(Number(stock)) || 0,
          });
      if (photo) saved = await api.uploadProductPhoto(saved.id, photo);
      onSaved(saved);
      if (!inline) onClose();
    } catch (err) {
      fail(err);
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
      if (!inline) onClose();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const title = product ? t('titleEdit') : t('titleAdd');
  const sheet = (
    <div
      className={inline ? 'sheet sheet-inline prd-sheet' : 'modal sheet prd-sheet'}
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : 'true'}
      aria-label={title}
      ref={sheetRef}
      onClick={inline ? undefined : (e) => e.stopPropagation()}
    >
      <div className="sheet-head">
        <button type="button" className="sheet-head-cancel" disabled={busy} onClick={onClose}>
          {part !== 'details' ? t('done') : t('cancel')}
        </button>
        <span className="sheet-head-title">{title}</span>
        {part === 'details' ? (
          <button type="button" className="sheet-head-save" disabled={busy || !canSave} onClick={() => void submit()}>
            {busy ? t('saving') : t('save')}
          </button>
        ) : (
          <span className="prd-head-spacer" aria-hidden="true" />
        )}
      </div>

      {product ? (
        <div className="prd-sheet-id">
          <img className="prd-sheet-photo" src={productPhotoUrl(product)} alt="" />
          <span className="prd-sheet-id-text">
            <span className="prd-sheet-name">{product.name}</span>
            <span className="prd-sheet-tags">
              {product.active ? (
                <span className={`prd-pill prd-pill-${stockTone(product)}`}>{stockTone(product) === 'out' ? tp('outOfStock') : stockTone(product) === 'low' ? tp('lowStock', { n: product.stock }) : tp('inStock')}</span>
              ) : (
                <span className="prd-pill prd-pill-off">{tp('retired')}</span>
              )}
              {product.categoryName ? <span className="prd-pill prd-pill-cat">{product.categoryName}</span> : null}
            </span>
          </span>
        </div>
      ) : null}
      {product ? (
        <div className="prd-seg prd-seg-3" role="tablist" aria-label={title}>
          {(['details', 'stock', 'sales'] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={part === p} className={part === p ? 'is-on' : ''} onClick={() => setPart(p)}>
              {t(`part.${p}`)}
            </button>
          ))}
        </div>
      ) : null}

      {part === 'stock' && product ? (
        <StockPanel product={product} onChanged={onSaved} />
      ) : part === 'sales' && product ? (
        <SalesPanel product={product} />
      ) : (
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
            {categories.length > 0 ? (
              <div className="sheet-row">
                <label className="sheet-row-label" htmlFor="prd-cat">
                  {t('category')}
                </label>
                <div className="sheet-row-value">
                  <select id="prd-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">{t('noCategory')}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor="prd-price">
                {t('price')}
              </label>
              <div className="sheet-row-value">
                <input id="prd-price" type="number" inputMode="numeric" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            </div>
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor="prd-cost">
                {t('cost')}
              </label>
              <div className="sheet-row-value prd-cost-value">
                <input id="prd-cost" type="number" inputMode="numeric" min={0} step={1} value={cost} placeholder={tc('optional')} onChange={(e) => setCost(e.target.value)} />
                {marginPct !== null ? <span className={`prd-margin ${marginPct < 0 ? 'prd-margin-neg' : ''}`}>{t('margin', { pct: marginPct })}</span> : null}
              </div>
            </div>
          </div>
          <div className="sheet-foot">{t('costHint')}</div>

          <div className="sheet-group">
            {!product ? (
              <div className="sheet-row">
                <label className="sheet-row-label" htmlFor="prd-stock">
                  {t('stock')}
                </label>
                <div className="sheet-row-value">
                  <input id="prd-stock" type="number" inputMode="numeric" step={1} value={stock} onChange={(e) => setStock(e.target.value)} />
                </div>
              </div>
            ) : null}
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor="prd-low">
                {t('lowAt')}
              </label>
              <div className="sheet-row-value">
                <input id="prd-low" type="number" inputMode="numeric" min={0} step={1} value={lowAt} placeholder={t('lowAtOff')} onChange={(e) => setLowAt(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="sheet-foot">{product ? t('lowAtHint') : t('stockHint')}</div>
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
      )}
    </div>
  );
  if (inline) return sheet;
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      {sheet}
    </div>
  );
}
