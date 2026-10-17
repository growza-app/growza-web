'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Product, ProductCategory } from '../lib/api-types';
import { PageHeader } from '../components/PageHeader';
import { IconSearch } from '../components/icons';
import { productPhotoUrl } from '../lib/service-photos';
import { matchItems } from '../lib/service-match';
import { productMatchable } from '../lib/product-match';
import { ALL_CATEGORIES, NO_CATEGORY } from './DeskProductCategories';

/**
 * Jira GRW-574 (part 4 · 0123) — count a branch's shelf in one pass.
 *
 * One full-width list, a number field per active product ("Counted"), a highlight when what was counted differs from
 * what the database says, an optional shared note, and one Save that writes an `adjusted` movement row only for the
 * products that differ, tied together by `stock_take_id`.
 */
export function parseStockTakeCount(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (trimmed === '' || !/^-?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < -100_000 || n > 1_000_000) return null;
  return n === 0 ? 0 : n;
}

export function StockTake({
  branchId,
  initialProducts,
  categories,
  onSaved,
  onCancel,
}: {
  branchId: string;
  initialProducts: Product[];
  categories: ProductCategory[];
  onSaved: (updated: Product[], adjusted: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const [shelf, setShelf] = useState<Product[]>(() =>
    initialProducts.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)),
  );
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialProducts.filter((p) => p.active).map((p) => [p.id, String(p.stock)])),
  );
  const touchedRef = useRef<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .stockTakeProducts(branchId)
      .then((fresh) => {
        if (cancelled) return;
        const active = fresh.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
        setShelf(active);
        setCounts((prev) => {
          const next = { ...prev };
          for (const p of active) {
            if (!touchedRef.current.has(p.id)) next[p.id] = String(p.stock);
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const noneCount = useMemo(() => shelf.filter((p) => p.categoryId === null).length, [shelf]);

  const shown = useMemo(() => {
    const pool = shelf.filter((p) =>
      category === NO_CATEGORY ? p.categoryId === null : category === ALL_CATEGORIES || p.categoryId === category,
    );
    const q = search.trim();
    return q.length >= 2 ? matchItems(pool.map(productMatchable), q) : pool;
  }, [shelf, category, search]);

  const parsedByProduct = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const p of shelf) {
      map.set(p.id, parseStockTakeCount(counts[p.id], p.stock));
    }
    return map;
  }, [shelf, counts]);

  const hasInvalid = useMemo(() => {
    for (const p of shelf) {
      if (parsedByProduct.get(p.id) === null) return true;
    }
    return false;
  }, [shelf, parsedByProduct]);

  const diffCount = useMemo(() => {
    let n = 0;
    for (const p of shelf) {
      const val = parsedByProduct.get(p.id);
      if (val !== null && val !== undefined && val !== p.stock) n++;
    }
    return n;
  }, [shelf, parsedByProduct]);

  const canSave = shelf.length > 0 && !hasInvalid && !busy;

  const setRowCount = (productId: string, raw: string) => {
    touchedRef.current.add(productId);
    setCounts((prev) => ({ ...prev, [productId]: raw }));
    if (error) setError(null);
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const payload = shelf.map((p) => ({
        productId: p.id,
        count: parsedByProduct.get(p.id) ?? p.stock,
      }));
      const res = await api.saveStockTake(branchId, {
        counts: payload,
        note: note.trim() || undefined,
      });
      onSaved(res.products, res.adjusted);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('stockTake.title')}
        subtitle={t('stockTake.subtitle')}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
              {t('form.cancel')}
            </button>
            <button type="button" className="btn" onClick={() => void save()} disabled={!canSave}>
              {busy ? t('form.saving') : t('stockTake.save')}
            </button>
          </>
        }
      />
      <div className="page-body prd-st-page">
        {error ? (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="card prd-st-bar">
          <div className="prd-st-bar-top">
            <label className="search-wrap prd-search prd-st-search">
              <IconSearch />
              <input
                type="text"
                className="search-input search-input-bare"
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {categories.length > 0 ? (
              <label className="prd-sort prd-st-cat">
                <span className="prd-sort-l">{t('categories.title')}</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value={ALL_CATEGORIES}>{t('categories.all')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.count})
                    </option>
                  ))}
                  {noneCount > 0 ? <option value={NO_CATEGORY}>{t('categories.none')}</option> : null}
                </select>
              </label>
            ) : null}
          </div>
          <div className="prd-st-bar-note">
            <label className="prd-st-note-label" htmlFor="prd-st-note">
              {t('ledger.note')}
            </label>
            <input
              id="prd-st-note"
              type="text"
              className="prd-st-note-input"
              maxLength={200}
              placeholder={t('stockTake.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <span className={`prd-st-summary ${diffCount > 0 ? 'prd-st-summary-diff' : ''}`} aria-live="polite">
              {diffCount > 0 ? t('stockTake.changedCount', { n: diffCount }) : t('stockTake.allMatch')}
            </span>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="empty">{search.trim().length >= 2 ? t('noMatch', { q: search.trim() }) : t('filters.none.all')}</div>
        ) : (
          <ul className="prd-st-list" aria-label={t('stockTake.title')}>
            {shown.map((p) => {
              const raw = counts[p.id] ?? String(p.stock);
              const parsed = parsedByProduct.get(p.id) ?? null;
              const invalid = parsed === null;
              const delta = parsed !== null ? parsed - p.stock : 0;
              const differs = !invalid && delta !== 0;
              return (
                <li
                  key={p.id}
                  className={`prd-st-row ${differs ? 'prd-st-row-diff' : ''} ${invalid ? 'prd-st-row-invalid' : ''}`}
                >
                  <img className="prd-photo" src={productPhotoUrl(p)} alt="" loading="lazy" />
                  <div className="prd-st-info">
                    <span className="prd-name">{p.name}</span>
                    <span className="prd-st-meta">
                      <span>{t('stockTake.systemStock', { n: p.stock })}</span>
                      {p.sku ? <span className="prd-st-code">{p.sku}</span> : null}
                      {differs ? (
                        <span className={`prd-pill ${delta > 0 ? '' : 'prd-pill-out'}`}>
                          {delta > 0 ? `+${delta}` : String(delta)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="prd-st-field">
                    <label className="prd-st-field-l" htmlFor={`prd-st-count-${p.id}`}>
                      {t('stockTake.counted')}
                    </label>
                    <input
                      id={`prd-st-count-${p.id}`}
                      type="text"
                      inputMode="numeric"
                      className="prd-st-input"
                      aria-label={t('stockTake.countedAria', { name: p.name })}
                      aria-invalid={invalid ? 'true' : undefined}
                      value={raw}
                      onChange={(e) => setRowCount(p.id, e.target.value)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
