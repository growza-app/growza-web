'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, formatMoney } from '../lib/api';
import { intlLocale } from '../lib/format';
import type { Product, ProductCategory } from '../lib/api-types';
import { PageHeader } from '../components/PageHeader';
import { IconCheck, IconSearch } from '../components/icons';
import { ProductPhoto } from '../components/ProductPhoto';
import { matchItems } from '../lib/service-match';
import { productMatchable } from '../lib/product-match';
import { ProductCategoriesDropdown } from './DeskProductCategories';
import { CountSizesSheet, sizesCountedLine } from './CountSizesSheet';
import { anySizeCounted, anySizeInvalid, changedSizes, draftOf, isSizedProduct, restorable, sizeGap, sizeLines, sizesOf } from './count-sizes';
import { matchesCategories, shelfWorthMinor, stockTone } from './ProductsList';

/**
 * Jira GRW-574 (part 4 · 0123) — count a branch's shelf in one pass.
 *
 * Uses the same Products layout (horizontal KPI strip at the top, Search + multi-select Categories filter in the
 * toolbar, table on a wide desk, compact rows on a phone), a number field per active product ("Counted"), a highlight
 * when what was counted differs from what the database says, and one Save that writes an `adjusted` movement row only
 * for the products that differ, tied together by `stock_take_id`.
 */
export function parseStockTakeCount(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined) return Math.max(0, fallback);
  const trimmed = raw.trim();
  if (trimmed === '' || !/^-?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1_000_000) return null;
  return n === 0 ? 0 : n;
}

export function StockTake({
  branchId,
  initialProducts,
  categories,
  initialCategories = [],
  initialSearch = '',
  onSaved,
  onCancel,
}: {
  branchId: string;
  initialProducts: Product[];
  categories: ProductCategory[];
  initialCategories?: readonly string[];
  initialSearch?: string;
  onSaved: (updated: Product[], adjusted: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [shelf, setShelf] = useState<Product[]>(() =>
    initialProducts.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)),
  );
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialProducts.filter((p) => p.active).map((p) => [p.id, String(Math.max(0, p.stock))])),
  );
  const touchedRef = useRef<Set<string>>(new Set());
  // Jira GRW-602 — what has been typed into each size (text), the style whose sheet is open, and the draft kept on the server.
  const [sizeCounts, setSizeCounts] = useState<Record<string, string>>({});
  const [sizing, setSizing] = useState<string | null>(null);
  const [shelfFresh, setShelfFresh] = useState(false);
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'kept' | 'failed'>('idle');
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [askClear, setAskClear] = useState(false);
  const dirtyRef = useRef(false);
  const draftLoadedRef = useRef(false);
  const [search, setSearch] = useState(initialSearch);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => [...initialCategories]);
  const [lowOnly, setLowOnly] = useState(false);
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
    // The shelf (with each style's sizes) and what was typed and kept the last time, in the same breath.
    void Promise.all([api.stockTakeProducts(branchId), api.stockTakeDraft(branchId).catch(() => null)])
      .then(([fresh, draft]) => {
        if (cancelled) return;
        const active = fresh.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
        setShelf(active);
        setShelfFresh(true);
        const back = draft && draft.updatedAt ? restorable(draft, active) : null;
        if (back) {
          for (const id of Object.keys(back.products)) touchedRef.current.add(id);
          setSizeCounts((prev) => ({ ...back.sizes, ...prev }));
          if (Object.keys(back.products).length + Object.keys(back.sizes).length > 0) setRestoredAt(draft!.updatedAt);
        }
        setCounts((prev) => {
          const next = { ...prev };
          for (const p of active) {
            if (back?.products[p.id] !== undefined && !touchedRef.current.has(p.id)) touchedRef.current.add(p.id);
            if (back?.products[p.id] !== undefined) next[p.id] = back.products[p.id]!;
            else if (!touchedRef.current.has(p.id)) next[p.id] = String(Math.max(0, p.stock));
          }
          return next;
        });
        draftLoadedRef.current = true;
      })
      .catch(() => {
        draftLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const parsedByProduct = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const p of shelf) {
      // A style with sizes has no count of its own; its sizes are counted in the sheet.
      if (isSizedProduct(p)) continue;
      map.set(p.id, parseStockTakeCount(counts[p.id], Math.max(0, p.stock)));
    }
    return map;
  }, [shelf, counts]);

  const liveCategories = useMemo(
    () => categories.map((c) => ({ ...c, count: shelf.filter((p) => p.categoryId === c.id).length })),
    [categories, shelf],
  );
  const noneCount = useMemo(() => shelf.filter((p) => p.categoryId === null).length, [shelf]);
  const inCategory = useMemo(() => shelf.filter((p) => matchesCategories(p, selectedCategories)), [shelf, selectedCategories]);
  const countedInCategory = useMemo(
    () => inCategory.map((p) => ({ ...p, stock: parsedByProduct.get(p.id) ?? p.stock })),
    [inCategory, parsedByProduct],
  );
  const lowCount = useMemo(() => countedInCategory.filter((p) => stockTone(p) !== 'ok').length, [countedInCategory]);
  const worth = useMemo(() => shelfWorthMinor(countedInCategory), [countedInCategory]);
  const toggleCategory = (id: string) =>
    setSelectedCategories((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const clearCategories = () => setSelectedCategories([]);

  const shown = useMemo(() => {
    const pool = inCategory.filter(
      (p) =>
        !lowOnly ||
        stockTone(p) !== 'ok' ||
        stockTone({ ...p, stock: parsedByProduct.get(p.id) ?? p.stock }) !== 'ok',
    );
    const q = search.trim();
    return q.length >= 2 ? matchItems(pool.map(productMatchable), q) : pool;
  }, [inCategory, lowOnly, parsedByProduct, search]);

  const hasInvalid = useMemo(() => {
    for (const p of shelf) {
      if (parsedByProduct.get(p.id) === null) return true;
    }
    return anySizeInvalid(shelf, sizeCounts);
  }, [shelf, parsedByProduct, sizeCounts]);

  const plainDiff = useMemo(() => {
    let n = 0;
    for (const p of shelf) {
      const val = parsedByProduct.get(p.id);
      if (val !== null && val !== undefined && val !== p.stock) n++;
    }
    return n;
  }, [shelf, parsedByProduct]);
  const sizeDiff = useMemo(() => changedSizes(shelf, sizeCounts), [shelf, sizeCounts]);
  const diffCount = plainDiff + sizeDiff;

  const showSaved = saved && diffCount === 0 && !hasInvalid;
  /*
   * Nothing counted, nothing to save: Save no longer writes the whole shelf back at the numbers it was opened with,
   * so pressing it before typing anything would send an empty pass. `touchedRef` is read during render, which is
   * safe here because every row that adds to it also calls `setCounts` and so re-renders.
   */
  const counted = touchedRef.current.size > 0 || anySizeCounted(shelf, sizeCounts);
  const canSave = shelf.length > 0 && counted && !hasInvalid && !busy && !showSaved;

  const setSizeCount = (variantId: string, raw: string) => {
    dirtyRef.current = true;
    setSizeCounts((prev) => ({ ...prev, [variantId]: raw }));
    if (saved) setSaved(false);
    if (error) setError(null);
  };

  const setRowCount = (productId: string, raw: string) => {
    dirtyRef.current = true;
    touchedRef.current.add(productId);
    setCounts((prev) => ({ ...prev, [productId]: raw }));
    if (saved) setSaved(false);
    if (error) setError(null);
  };

  /*
   * Jira GRW-602 — the walk survives a closed tab: what is typed is kept on the server a moment after the last keystroke.
   * Nothing is counted by it; only Save changes a count. The draft is written only after the saved one has been read
   * back, so opening the screen can never overwrite a walk in progress with an empty one.
   */
  const draftNow = useRef<() => Promise<void>>(async () => {});
  draftNow.current = async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setDraftState('saving');
    try {
      await api.saveStockTakeDraft(branchId, draftOf(counts, touchedRef.current, sizeCounts));
      setDraftState('kept');
    } catch {
      dirtyRef.current = true;
      setDraftState('failed');
    }
  };
  useEffect(() => {
    if (!draftLoadedRef.current || !dirtyRef.current) return;
    const timer = window.setTimeout(() => void draftNow.current(), 1200);
    return () => window.clearTimeout(timer);
  }, [counts, sizeCounts]);
  // Leaving the screen within that moment still keeps the last numbers.
  useEffect(() => () => void draftNow.current(), []);

  const startOver = async () => {
    setAskClear(false);
    try {
      await api.clearStockTakeDraft(branchId);
    } catch {
      /* the screen is cleared either way; a draft the server still holds is replaced by the next keystroke */
    }
    touchedRef.current.clear();
    dirtyRef.current = false;
    setSizeCounts({});
    setCounts(Object.fromEntries(shelf.map((p) => [p.id, String(Math.max(0, p.stock))])));
    setRestoredAt(null);
    setDraftState('idle');
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      /*
       * QA, 2026-10-17 — ONLY the rows somebody actually counted.
       *
       * This sent an absolute count for every product on the shelf, falling back to the count read when the screen
       * opened. A sale, a breakage or a delivery landing while the sheet was open was written straight back out of
       * existence: open at 10:00, the till sells two at 10:05, count one other product, save — and the server was
       * told the sold product still had its 10:00 number. `touchedRef` already knows which rows were typed in.
       */
      const payload = shelf
        .filter((p) => touchedRef.current.has(p.id) && !isSizedProduct(p))
        .map((p) => ({
          productId: p.id,
          count: parsedByProduct.get(p.id) ?? p.stock,
        }));
      const res = await api.saveStockTake(branchId, {
        counts: payload,
        sizes: sizeLines(shelf, sizeCounts),
      });
      // The shelf again, with each style's sizes as they are now (the commit's own answer carries styles only).
      const fresh = await api.stockTakeProducts(branchId).catch(() => res.products);
      const active = fresh.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
      touchedRef.current.clear();
      dirtyRef.current = false;
      setSizeCounts({});
      setRestoredAt(null);
      setDraftState('idle');
      setShelf(active);
      setCounts(Object.fromEntries(active.map((p) => [p.id, String(p.stock)])));
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
        <span className="prd-stat-n">{inCategory.length}</span>
        <span className="prd-stat-l">{t('strip.products')}</span>
      </div>
      <div className="prd-stat" role="listitem">
        <span className="prd-stat-n">{formatMoney(worth)}</span>
        <span className="prd-stat-l">{t('strip.worth')}</span>
      </div>
      <div role="listitem" className="prd-stat-cell">
        <button
          type="button"
          className={`prd-stat prd-stat-tap ${lowCount > 0 ? 'prd-stat-low' : ''} ${lowOnly ? 'is-on' : ''}`}
          aria-pressed={lowOnly}
          onClick={() => setLowOnly((cur) => (cur || lowCount === 0 ? false : true))}
        >
          <span className="prd-stat-n">{lowCount}</span>
          <span className="prd-stat-l">{t('strip.low')}</span>
        </button>
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

  const categoriesDropdown =
    liveCategories.length > 0 || noneCount > 0 ? (
      <ProductCategoriesDropdown
        selected={selectedCategories}
        categories={liveCategories}
        noneCount={noneCount}
        onToggle={toggleCategory}
        onClear={clearCategories}
      />
    ) : null;

  /** Jira GRW-602 — a style with sizes shows one button where the count box would be, and the sheet counts its sizes. */
  const changedIn = (p: Product) => sizesOf(p).filter((sz) => (sizeGap(sz, sizeCounts[sz.id]) ?? 0) !== 0).length;
  const sizedCell = (p: Product) => {
    const { n, m } = sizesCountedLine(p, sizeCounts);
    return (
      <button
        type="button"
        className="pcs-open"
        disabled={!shelfFresh || m === 0}
        aria-label={t('stockTake.sizesTitle', { name: p.name })}
        onClick={() => setSizing(p.id)}
      >
        <span>{t('stockTake.countSizes')}</span>
        <span className="pcs-open-sub">{!shelfFresh || m === 0 ? t('stockTake.sizesNone') : t('stockTake.sizesCounted', { n, m })}</span>
      </button>
    );
  };
  const sizingProduct = sizing ? (shelf.find((p) => p.id === sizing) ?? null) : null;
  const sizeSheet = sizingProduct ? <CountSizesSheet product={sizingProduct} typed={sizeCounts} onType={setSizeCount} onClose={() => setSizing(null)} /> : null;

  /** The walk is kept on the server; say so, and say when a walk from before has come back. */
  const restoredBanner = restoredAt ? (
    <div className="banner pcs-restored" role="status">
      <span>{t('stockTake.restored', { date: new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(restoredAt)) })}</span>
      {askClear ? (
        <>
          <span>{t('stockTake.startOverAsk')}</span>
          <button type="button" className="btn" onClick={() => void startOver()}>
            {t('stockTake.startOverYes')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setAskClear(false)}>
            {t('stockTake.startOverNo')}
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setAskClear(true)}>
          {t('stockTake.startOver')}
        </button>
      )}
    </div>
  ) : null;
  const keptLine =
    draftState === 'idle' ? null : (
      <span className="pcs-kept" role="status">
        {draftState === 'saving' ? t('stockTake.keptSaving') : draftState === 'failed' ? t('stockTake.keptFailed') : t('stockTake.kept')}
      </span>
    );

  const summaryPill = (
    <span
      className={`prd-st-summary ${hasInvalid ? 'prd-st-summary-invalid' : diffCount > 0 ? 'prd-st-summary-diff' : ''}`}
      aria-live="polite"
    >
      {hasInvalid
        ? t('stockTake.sayCount')
        : diffCount > 0
          ? [plainDiff > 0 ? t('stockTake.changedCount', { n: plainDiff }) : null, sizeDiff > 0 ? t('stockTake.sizedChanged', { n: sizeDiff }) : null].filter(Boolean).join(' · ')
          : t('stockTake.allMatch')}
    </span>
  );

  const nothing = (
    <div className="empty">
      {search.trim().length >= 2 ? t('noMatch', { q: search.trim() }) : t(`filters.none.${lowOnly ? 'low' : 'all'}`)}
    </div>
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
          {restoredBanner}
          {strip}
          <section className="pf-wide-mid prd-desk-mid" aria-label={t('stockTake.title')}>
            <div className="prd-desk-tools prd-st-desk-tools">
              {searchBox}
              {categoriesDropdown}
              {summaryPill}
              {keptLine}
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
                        const sized = isSizedProduct(p);
                        const raw = counts[p.id] ?? String(p.stock);
                        const parsed = sized ? p.stock : (parsedByProduct.get(p.id) ?? null);
                        const invalid = parsed === null;
                        const delta = parsed !== null ? parsed - p.stock : 0;
                        const differs = sized ? changedIn(p) > 0 : !invalid && delta !== 0;
                        return (
                          <tr
                            key={p.id}
                            className={`prd-st-tr ${differs ? 'prd-st-row-diff' : ''} ${invalid ? 'prd-st-row-invalid' : ''}`}
                          >
                            <td>
                              <div className="prd-cell-name">
                                <ProductPhoto className="prd-photo" product={p} />
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
                                {sized ? (
                                  <>
                                    {differs ? <span className="prd-pill">{t('stockTake.sizedChanged', { n: changedIn(p) })}</span> : null}
                                    {sizedCell(p)}
                                  </>
                                ) : null}
                                {sized ? null : differs ? (
                                  <span className={`prd-pill ${delta > 0 ? '' : 'prd-pill-out'}`}>
                                    {delta > 0 ? `+${delta}` : String(delta)}
                                  </span>
                                ) : null}
                                {sized ? null : (
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
                                )}
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
        {sizeSheet}
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

        {restoredBanner}
        {strip}

        <div className="prd-tools prd-st-tools">
          {searchBox}
          <div className="prd-st-filter-row">
            {categoriesDropdown}
            {summaryPill}
          </div>
          {keptLine}
        </div>

        {shown.length === 0 ? (
          nothing
        ) : (
          <ul className="prd-st-list" aria-label={t('stockTake.title')}>
            {shown.map((p) => {
              const sized = isSizedProduct(p);
              const raw = counts[p.id] ?? String(p.stock);
              const parsed = sized ? p.stock : (parsedByProduct.get(p.id) ?? null);
              const invalid = parsed === null;
              const delta = parsed !== null ? parsed - p.stock : 0;
              const differs = sized ? changedIn(p) > 0 : !invalid && delta !== 0;
              return (
                <li
                  key={p.id}
                  className={`prd-st-row ${differs ? 'prd-st-row-diff' : ''} ${invalid ? 'prd-st-row-invalid' : ''}`}
                >
                  <ProductPhoto className="prd-photo" product={p} />
                  <div className="prd-st-info">
                    <span className="prd-name">{p.name}</span>
                    <span className="prd-st-meta">
                      <span>{t('stockTake.systemStock', { n: p.stock })}</span>
                      {p.sku ? <span className="prd-st-code">{p.sku}</span> : null}
                      {sized ? (
                        differs ? <span className="prd-pill">{t('stockTake.sizedChanged', { n: changedIn(p) })}</span> : null
                      ) : differs ? (
                        <span className={`prd-pill ${delta > 0 ? '' : 'prd-pill-out'}`}>
                          {delta > 0 ? `+${delta}` : String(delta)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="prd-st-field">
                    {sized ? (
                      sizedCell(p)
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {sizeSheet}
    </>
  );
}

