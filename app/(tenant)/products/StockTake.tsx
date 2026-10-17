'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, formatMoney } from '../lib/api';
import type { Product, ProductCategory } from '../lib/api-types';
import { PageHeader } from '../components/PageHeader';
import { IconCheck, IconSearch } from '../components/icons';
import { productPhotoUrl } from '../lib/service-photos';
import { matchItems } from '../lib/service-match';
import { productMatchable } from '../lib/product-match';
import { ALL_CATEGORIES, DeskProductCategories, NO_CATEGORY } from './DeskProductCategories';
import { shelfWorthMinor, stockTone } from './ProductsList';

/**
 * Jira GRW-574 (part 4 · 0123) — count a branch's shelf in one pass.
 *
 * Uses the same Products layout (left categories + table on a wide desk, compact rows on a phone), a number field per
 * active product ("Counted"), a highlight when what was counted differs from what the database says, an optional shared
 * note, and one Save that writes an `adjusted` movement row only for the products that differ, tied together by
 * `stock_take_id`.
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
  initialCategory = ALL_CATEGORIES,
  initialSearch = '',
  onSaved,
  onCancel,
}: {
  branchId: string;
  initialProducts: Product[];
  categories: ProductCategory[];
  initialCategory?: string;
  initialSearch?: string;
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
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState<string>(initialCategory);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desk, setDesk] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1101px)');
    const read = () => setDesk(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);

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
  const lowCount = useMemo(() => shelf.filter((p) => stockTone(p) !== 'ok').length, [shelf]);
  const worth = useMemo(() => shelfWorthMinor(shelf), [shelf]);

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

  const showSaved = saved && diffCount === 0 && !hasInvalid;
  const canSave = shelf.length > 0 && !hasInvalid && !busy;

  const setRowCount = (productId: string, raw: string) => {
    touchedRef.current.add(productId);
    setCounts((prev) => ({ ...prev, [productId]: raw }));
    if (saved) setSaved(false);
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
      const active = res.products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
      touchedRef.current.clear();
      setShelf(active);
      setCounts(Object.fromEntries(active.map((p) => [p.id, String(p.stock)])));
      setNote('');
      setSaved(true);
      onSaved(res.products, res.adjusted);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <PageHeader
      title={t('stockTake.title')}
      subtitle={t('stockTake.subtitle')}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {showSaved ? t('form.done') : t('form.cancel')}
          </button>
          <button
            type="button"
            className={`btn prd-st-save ${showSaved ? 'is-saved' : ''}`}
            aria-live="polite"
            onClick={() => void save()}
            disabled={!canSave}
          >
            {busy ? (
              t('form.saving')
            ) : showSaved ? (
              <>
                <IconCheck /> {t('form.saved')}
              </>
            ) : (
              t('stockTake.save')
            )}
          </button>
        </>
      }
    />
  );

  const strip = (
    <div className="prd-strip" role="list">
      <div className="prd-stat" role="listitem">
        <span className="prd-stat-n">{shelf.length}</span>
        <span className="prd-stat-l">{t('strip.products')}</span>
      </div>
      <div className="prd-stat" role="listitem">
        <span className="prd-stat-n">{formatMoney(worth)}</span>
        <span className="prd-stat-l">{t('strip.worth')}</span>
      </div>
      <div className={`prd-stat ${lowCount > 0 ? 'prd-stat-low' : ''}`} role="listitem">
        <span className="prd-stat-n">{lowCount}</span>
        <span className="prd-stat-l">{t('strip.low')}</span>
      </div>
    </div>
  );

  const searchBox = (
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
  );

  const noteBar = (
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
        onChange={(e) => {
          setNote(e.target.value);
          if (saved) setSaved(false);
        }}
      />
      <span className={`prd-st-summary ${diffCount > 0 ? 'prd-st-summary-diff' : ''}`} aria-live="polite">
        {diffCount > 0 ? t('stockTake.changedCount', { n: diffCount }) : t('stockTake.allMatch')}
      </span>
    </div>
  );

  const nothing = (
    <div className="empty">{search.trim().length >= 2 ? t('noMatch', { q: search.trim() }) : t('filters.none.all')}</div>
  );

  if (desk === null) {
    return (
      <>
        {header}
        <div className="page-body" aria-busy="true" />
      </>
    );
  }

  if (desk) {
    return (
      <>
        {header}
        <div className="page-body prd-desk">
          {error ? (
            <div className="banner banner-error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="pf-wide-grid prd-desk-grid prd-st-desk-grid">
            <aside className="pf-wide-left prd-desk-left" aria-label={t('categories.title')}>
              {strip}
              <DeskProductCategories
                picked={category}
                categories={categories}
                allCount={shelf.length}
                noneCount={noneCount}
                onPick={setCategory}
              />
            </aside>
            <section className="pf-wide-mid prd-desk-mid" aria-label={t('stockTake.title')}>
              <div className="prd-desk-tools prd-st-desk-tools">
                {searchBox}
                {noteBar}
              </div>
              <div className="card prd-desk-card">
                {shown.length === 0 ? (
                  nothing
                ) : (
                  <div className="table-scroll">
                    <table className="prd-table prd-st-table" aria-label={t('stockTake.title')}>
                      <thead>
                        <tr>
                          <th>{t('cols.product')}</th>
                          <th className="prd-td-num">{t('cols.price')}</th>
                          <th className="prd-td-num">{t('cols.cost')}</th>
                          <th className="prd-td-num">{t('cols.stock')}</th>
                          <th className="prd-td-num">{t('stockTake.counted')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((p) => {
                          const raw = counts[p.id] ?? String(p.stock);
                          const parsed = parsedByProduct.get(p.id) ?? null;
                          const invalid = parsed === null;
                          const delta = parsed !== null ? parsed - p.stock : 0;
                          const differs = !invalid && delta !== 0;
                          return (
                            <tr
                              key={p.id}
                              className={`prd-st-tr ${differs ? 'prd-st-row-diff' : ''} ${invalid ? 'prd-st-row-invalid' : ''}`}
                            >
                              <td>
                                <div className="prd-cell-name">
                                  <img className="prd-photo" src={productPhotoUrl(p)} alt="" loading="lazy" />
                                  <span className="prd-name">
                                    {p.name}
                                    <span className="prd-name-cat">
                                      {p.categoryName ?? t('categories.none')}
                                      {p.sku ? ` · ${p.sku}` : ''}
                                    </span>
                                  </span>
                                </div>
                              </td>
                              <td className="prd-td-num">{formatMoney(p.priceMinor)}</td>
                              <td className="prd-td-num prd-td-muted">
                                {p.costMinor != null ? formatMoney(p.costMinor) : '—'}
                              </td>
                              <td className="prd-td-num">
                                <span className={`prd-td-stock prd-td-stock-${stockTone(p)}`}>{p.stock}</span>
                              </td>
                              <td className="prd-td-num prd-st-td-count">
                                <div className="prd-st-cell-count">
                                  {differs ? (
                                    <span className={`prd-pill ${delta > 0 ? '' : 'prd-pill-out'}`}>
                                      {delta > 0 ? `+${delta}` : String(delta)}
                                    </span>
                                  ) : null}
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
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="page-body prd-page prd-st-page">
        {error ? (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="prd-tools prd-st-tools">
          {searchBox}
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
          {noteBar}
        </div>

        {shown.length === 0 ? (
          nothing
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
