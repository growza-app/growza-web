'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Product, ProductCategory } from '../lib/api-types';
import { useDialog } from '../../shared/a11y/useDialog';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';
import { IconCheck } from '../components/icons';
import { GstInPrice, TaxFields } from '../components/TaxFields';
import { productPhotoUrl } from '../lib/service-photos';
import { codeHolder } from '../lib/product-match';
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
  initialSaved = false,
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
  /** True when a newly created product on the wide desk mounts in place right after Save. */
  initialSaved?: boolean;
}) {
  const t = useTranslations('products.form');
  const tp = useTranslations('products');
  const tc = useTranslations('common');
  const sheetRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [part, setPart] = useState<Part>('details');
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? String(Number(product.priceMinor) / 100) : '');
  const [cost, setCost] = useState(product?.costMinor != null ? String(Number(product.costMinor) / 100) : '');
  const [lowAt, setLowAt] = useState(product && product.lowStockAt > 0 ? String(product.lowStockAt) : '');
  const [categoryId, setCategoryId] = useState<string>(product?.categoryId ?? '');
  /** Jira GRW-574 (0119) — the business's own code, and what a scanner reads off the pack. */
  const [sku, setSku] = useState(product?.sku ?? '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  /** Jira GRW-574 (0120) — optional GST rate (basis points; 0 is 0%, '' is not set) and HSN code, shown when set or opened. */
  const [gstRateBp, setGstRateBp] = useState<string>(product?.gstRateBp != null ? String(product.gstRateBp) : '');
  const [hsn, setHsn] = useState(product?.hsn ?? '');
  const [taxOpen, setTaxOpen] = useState(Boolean(product && (product.gstRateBp != null || product.hsn)));
  const [stock, setStock] = useState('0');
  const [photo, setPhoto] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  /**
   * Review, 2026-10-15 — a save that made the product but could not upload its photo. The product now exists, so a
   * second Save updates it (never a second create, which would meet the duplicate-name 409), and closing the sheet
   * tells the list about it.
   */
  const [pending, setPending] = useState<Product | null>(null);
  const target = pending ?? product;
  const close = () => {
    if (pending) onSaved(pending);
    onClose();
  };
  useDialog(sheetRef, { onClose: busy || inline ? undefined : close, active: !inline });

  // One object URL per picked file, released when the file changes or the sheet closes (not one per render).
  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );

  const rupees = Number(price);
  const costRupees = cost.trim() === '' ? null : Number(cost);
  /** The API's own rule (printable characters, no spaces), said here so the owner is told before Save, in their language. */
  const barcodeBad = barcode.trim() !== '' && !/^[!-~]+$/.test(barcode.trim());
  const valid =
    name.trim().length > 0 && price.trim() !== '' && Number.isFinite(rupees) && rupees >= 0 && (costRupees === null || (Number.isFinite(costRupees) && costRupees >= 0)) && (!product ? stock.trim() === '' || (Number.isFinite(Number(stock)) && Number(stock) >= 0) : true) && !barcodeBad;
  const dirty = target
    ? name.trim() !== target.name ||
      Math.round(rupees * 100) !== Number(target.priceMinor) ||
      (costRupees === null ? null : Math.round(costRupees * 100)) !== (target.costMinor == null ? null : Number(target.costMinor)) ||
      (lowAt.trim() === '' ? 0 : Math.max(0, Math.trunc(Number(lowAt)) || 0)) !== target.lowStockAt ||
      (categoryId || null) !== target.categoryId ||
      (sku.trim() || null) !== (target.sku ?? null) ||
      (barcode.trim() || null) !== (target.barcode ?? null) ||
      (gstRateBp === '' ? null : Number(gstRateBp)) !== (target.gstRateBp ?? null) ||
      (hsn.trim() || null) !== (target.hsn ?? null) ||
      photo !== null
    : true;
  const canSave = valid && dirty;
  useEffect(() => {
    if (dirty && justSaved) setJustSaved(false);
  }, [dirty, justSaved]);
  const showSaved = justSaved && !dirty && !busy;
  const marginPct = costRupees !== null && rupees > 0 && Number.isFinite(costRupees) ? Math.round(((rupees - costRupees) / rupees) * 100) : null;

  const fail = (err: unknown) => {
    const holder = codeHolder(err);
    if (holder) setError(t(holder.field === 'sku' ? 'skuTaken' : 'barcodeTaken', { name: holder.name }));
    else setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
  };

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
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        gstRateBp: gstRateBp === '' ? null : Number(gstRateBp),
        hsn: hsn.trim() || null,
      };
      let saved = target
        ? await api.updateProduct(target.id, body)
        : await api.createProduct(branchId, {
            ...body,
            stock: Math.max(0, Math.trunc(Number(stock)) || 0),
          });
      if (photo) {
        try {
          saved = await api.uploadProductPhoto(saved.id, photo);
          setPhoto(null);
          setImageUrl(saved.imageUrl);
          if (photoRef.current) photoRef.current.value = '';
        } catch (err) {
          setPending(saved);
          setError(err instanceof ApiError && err.status < 500 ? err.message : t('photoFailed'));
          return;
        }
      }
      setName(saved.name);
      setPrice(String(Number(saved.priceMinor) / 100));
      setCost(saved.costMinor != null ? String(Number(saved.costMinor) / 100) : '');
      setLowAt(saved.lowStockAt > 0 ? String(saved.lowStockAt) : '');
      setCategoryId(saved.categoryId ?? '');
      setSku(saved.sku ?? '');
      setBarcode(saved.barcode ?? '');
      setGstRateBp(saved.gstRateBp != null ? String(saved.gstRateBp) : '');
      setHsn(saved.hsn ?? '');
      setPending(null);
      setJustSaved(true);
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
        <button type="button" className="sheet-head-cancel" disabled={busy} onClick={close}>
          {part !== 'details' ? t('done') : t('cancel')}
        </button>
        <span className="sheet-head-title">{title}</span>
        {part === 'details' ? (
          <button
            type="button"
            className={`sheet-head-save ${showSaved ? 'is-saved' : ''}`}
            disabled={busy || !canSave}
            aria-live="polite"
            onClick={() => void submit()}
          >
            {busy ? (
              t('saving')
            ) : showSaved ? (
              <>
                <IconCheck /> {t('saved')}
              </>
            ) : (
              t('save')
            )}
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
                <span className={`prd-pill prd-pill-${stockTone(product)}`}>
                  {stockTone(product) === 'out' ? tp('outOfStock') : stockTone(product) === 'low' ? tp('lowStock', { n: product.stock }) : tp('inStock')}
                </span>
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
              <img className="sheet-photo-img" src={photoPreview ?? ''} alt="" />
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
                  if (photoRef.current) photoRef.current.value = '';
                  if (target && imageUrl) {
                    // Only what the server did is shown: a failed removal leaves the picture on screen, with the reason.
                    try {
                      const updated = await api.removeProductPhoto(target.id);
                      setImageUrl(null);
                      onSaved(updated);
                    } catch (err) {
                      fail(err);
                    }
                  }
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
          <GstInPrice priceMinor={Math.round(rupees * 100)} rateBp={gstRateBp} />

          {/* Jira GRW-574 — the codes the shelf and the till can find the product by. Both optional, blank clears. */}
          <div className="sheet-group">
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor="prd-sku">
                {t('sku')}
              </label>
              <div className="sheet-row-value">
                <input
                  id="prd-sku"
                  type="text"
                  value={sku}
                  placeholder={tc('optional')}
                  maxLength={40}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={barcodeBad ? undefined : 'prd-codes-hint'}
                  onChange={(e) => setSku(e.target.value)}
                />
              </div>
            </div>
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor="prd-barcode">
                {t('barcode')}
              </label>
              <div className="sheet-row-value">
                <input
                  id="prd-barcode"
                  type="text"
                  value={barcode}
                  placeholder={tc('optional')}
                  maxLength={64}
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={barcodeBad || undefined}
                  aria-describedby={barcodeBad ? 'prd-barcode-error' : 'prd-codes-hint'}
                  onChange={(e) => setBarcode(e.target.value)}
                />
              </div>
            </div>
          </div>
          {barcodeBad ? (
            <div id="prd-barcode-error" className="sheet-foot sheet-foot-error">
              {t('barcodeSpaces')}
            </div>
          ) : (
            <div id="prd-codes-hint" className="sheet-foot">{t('codesHint')}</div>
          )}

          <div className="sheet-group">
            {!product ? (
              <div className="sheet-row">
                <label className="sheet-row-label" htmlFor="prd-stock">
                  {t('stock')}
                </label>
                <div className="sheet-row-value">
                  <input id="prd-stock" type="number" inputMode="numeric" min={0} step={1} value={stock} onChange={(e) => setStock(e.target.value)} />
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

          {/* Jira GRW-574 (0120) — optional GST rate and HSN code, collapsed unless set or opened. */}
          <TaxFields
            idPrefix="prd"
            kind="product"
            rateBp={gstRateBp}
            onRateBp={setGstRateBp}
            code={hsn}
            onCode={setHsn}
            open={taxOpen}
            onToggle={() => setTaxOpen((o) => !o)}
            savedRateBp={target?.gstRateBp}
          />
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
    <div className="modal-backdrop" onClick={busy ? undefined : close}>
      {sheet}
    </div>
  );
}
