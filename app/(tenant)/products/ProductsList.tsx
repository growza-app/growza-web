'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, formatMoney } from '../lib/api';
import type { Product, ProductCategory } from '../lib/api-types';
import { PageHeader } from '../components/PageHeader';
import { WriteOnly } from '../components/WriteOnly';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import { useWritable } from '../components/SessionProvider';
import { IconPlus, IconSearch } from '../components/icons';
import { productPhotoUrl } from '../lib/service-photos';
import { asMinor, matchItems } from '../lib/service-match';
import { ProductSheet } from './ProductSheet';
import { ALL_CATEGORIES, DeskProductCategories, NO_CATEGORY } from './DeskProductCategories';

/**
 * Owner, 2026-10-14 — the shelf, the way a stock screen is read.
 *
 * Phone: three numbers, a search, a category picker and the status chips, then a row per product with a green /
 * amber / red stock pill; tapping a row opens the sheet. Wide desk (≥1101px): three panels — categories on the
 * left (0117), a table in the middle with sort and pages, the product on the right as the sheet drawn in place.
 *
 * Nothing here names a kind of business: the same screen sells a clinic's consumables and a gym's protein.
 */
export type ShelfFilter = 'all' | 'low' | 'out' | 'retired';
export const SHELF_FILTERS: readonly ShelfFilter[] = ['all', 'low', 'out', 'retired'];
export type ShelfSort = 'name' | 'stock' | 'sold' | 'price';
export const SHELF_SORTS: readonly ShelfSort[] = ['name', 'stock', 'sold', 'price'];

/** The pill's colour: red at zero, amber at or under the owner's line, green otherwise. Retired products carry no pill. */
export const stockTone = (p: Pick<Product, 'stock' | 'lowStockAt' | 'active'>): 'ok' | 'low' | 'out' => (p.stock <= 0 ? 'out' : p.lowStockAt > 0 && p.stock <= p.lowStockAt ? 'low' : 'ok');

/** What the shelf is worth at the shelf price, counting only what is actually there. */
export const shelfWorthMinor = (rows: readonly Pick<Product, 'stock' | 'priceMinor' | 'active'>[]): number =>
  rows.reduce((sum, p) => sum + (p.active && p.stock > 0 ? p.stock * Number(p.priceMinor) : 0), 0);

/** The category first, the chip second, then the search — the same spelling-tolerant matcher the till uses (GRW-375), from the second letter. */
export function filterShelf(rows: readonly Product[], filter: ShelfFilter, search: string, category: string = ALL_CATEGORIES): Product[] {
  const pool = rows.filter((p) => {
    if (category === NO_CATEGORY ? p.categoryId !== null : category !== ALL_CATEGORIES && p.categoryId !== category) return false;
    if (filter === 'retired') return !p.active;
    if (!p.active) return false;
    const tone = stockTone(p);
    if (filter === 'low') return tone !== 'ok';
    if (filter === 'out') return tone === 'out';
    return true;
  });
  const q = search.trim();
  return q.length >= 2
    ? matchItems(
        pool.map((p) => ({ item: p, text: [p.name, p.categoryName ?? ''], priceMinor: asMinor(p.priceMinor) })),
        q,
      )
    : pool;
}

export function sortShelf(rows: readonly Product[], sort: ShelfSort): Product[] {
  const by: Record<ShelfSort, (a: Product, b: Product) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    stock: (a, b) => a.stock - b.stock || a.name.localeCompare(b.name),
    sold: (a, b) => b.sold - a.sold || a.name.localeCompare(b.name),
    price: (a, b) => Number(b.priceMinor) - Number(a.priceMinor) || a.name.localeCompare(b.name),
  };
  return [...rows].sort(by[sort]);
}

export function ProductsList({ products, categories: initialCategories, branchId }: { products: Product[]; categories: ProductCategory[]; branchId: string }) {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const router = useRouter();
  const writable = useWritable();
  const [rows, setRows] = useState(products);
  const [categories, setCategories] = useState(initialCategories);
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const [sort, setSort] = useState<ShelfSort>('name');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ProductCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The wide screen is three panels — categories · the shelf · the product — the way Services and the till are. `null` until the width is known. */
  const [desk, setDesk] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1101px)');
    const read = () => setDesk(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);

  const live = useMemo(() => rows.filter((p) => p.active), [rows]);
  const lowCount = useMemo(() => live.filter((p) => stockTone(p) !== 'ok').length, [live]);
  const worth = useMemo(() => shelfWorthMinor(rows), [rows]);
  const inCategory = useMemo(() => filterShelf(rows, 'all', '', category), [rows, category]);
  const shown = useMemo(() => sortShelf(filterShelf(rows, filter, search, category), sort), [rows, filter, search, category, sort]);
  const counts: Record<ShelfFilter, number> = {
    all: inCategory.length,
    low: inCategory.filter((p) => stockTone(p) !== 'ok').length,
    out: inCategory.filter((p) => p.stock <= 0).length,
    retired: rows.filter((p) => !p.active && (category === ALL_CATEGORIES || (category === NO_CATEGORY ? p.categoryId === null : p.categoryId === category))).length,
  };
  const noneCount = live.filter((p) => p.categoryId === null).length;
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageRows = shown.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);
  const pick = (f: () => void) => {
    f();
    setPage(1);
  };

  const refreshCategories = () =>
    api
      .productCategories(branchId)
      .then(setCategories)
      .catch(() => {});
  const saved = (p: Product) => {
    setRows((prev) => {
      const at = prev.findIndex((x) => x.id === p.id);
      const next = at >= 0 ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p];
      return [...next].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    });
    setEditing((cur) => (cur && cur !== 'new' && cur.id === p.id ? p : cur === 'new' ? p : cur));
    void refreshCategories();
    router.refresh();
  };
  const fail = (err: unknown) => setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProduct(deleting.id);
      setRows((prev) => prev.filter((x) => x.id !== deleting.id));
      setDeleting(null);
      setEditing(null);
      void refreshCategories();
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const addCategory = async (name: string) => {
    const c = await api.createProductCategory(branchId, name);
    setCategories((prev) => [...prev, c]);
  };
  const removeCategory = async () => {
    if (!deletingCategory) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProductCategory(branchId, deletingCategory.id);
      setCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id));
      setRows((prev) => prev.map((p) => (p.categoryId === deletingCategory.id ? { ...p, categoryId: null, categoryName: null } : p)));
      if (category === deletingCategory.id) setCategory(ALL_CATEGORIES);
      setDeletingCategory(null);
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <PageHeader
      title={t('title')}
      subtitle={t('subtitle')}
      actions={
        <WriteOnly>
          <button type="button" className="btn" onClick={() => setEditing('new')}>
            <IconPlus /> {t('add')}
          </button>
        </WriteOnly>
      }
    />
  );
  const strip = (
    <div className="prd-strip" role="list">
      <div className="prd-stat" role="listitem">
        <span className="prd-stat-n">{live.length}</span>
        <span className="prd-stat-l">{t('strip.products')}</span>
      </div>
      <div className="prd-stat" role="listitem">
        <span className="prd-stat-n">{formatMoney(worth)}</span>
        <span className="prd-stat-l">{t('strip.worth')}</span>
      </div>
      <button type="button" className={`prd-stat prd-stat-tap ${lowCount > 0 ? 'prd-stat-low' : ''}`} role="listitem" onClick={() => pick(() => setFilter(lowCount > 0 ? 'low' : 'all'))}>
        <span className="prd-stat-n">{lowCount}</span>
        <span className="prd-stat-l">{t('strip.low')}</span>
      </button>
    </div>
  );
  const searchBox = (
    <label className="search-wrap prd-search">
      <IconSearch />
      <input type="text" className="search-input search-input-bare" placeholder={t('searchPlaceholder')} value={search} onChange={(e) => pick(() => setSearch(e.target.value))} />
    </label>
  );
  const chips = (
    <div className="prd-chips" role="group" aria-label={t('filters.label')}>
      {SHELF_FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          className={`prd-chip ${filter === f ? 'prd-chip-on' : ''} ${f === 'low' && counts.low > 0 ? 'prd-chip-warn' : ''}`}
          aria-pressed={filter === f}
          onClick={() => pick(() => setFilter(f))}
        >
          {t(`filters.${f}`)} <span className="prd-chip-n">{counts[f]}</span>
        </button>
      ))}
    </div>
  );
  const sortBox = (
    <label className="prd-sort">
      <span className="prd-sort-l">{t('sort.label')}</span>
      <select value={sort} onChange={(e) => pick(() => setSort(e.target.value as ShelfSort))}>
        {SHELF_SORTS.map((s) => (
          <option key={s} value={s}>
            {t(`sort.${s}`)}
          </option>
        ))}
      </select>
    </label>
  );
  const categorySelect = (
    <label className="prd-sort">
      <span className="prd-sort-l">{t('categories.title')}</span>
      <select value={category} onChange={(e) => pick(() => setCategory(e.target.value))}>
        <option value={ALL_CATEGORIES}>{t('categories.all')}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.count})
          </option>
        ))}
        {noneCount > 0 ? <option value={NO_CATEGORY}>{t('categories.none')}</option> : null}
      </select>
    </label>
  );
  const isOn = (p: Product) => Boolean(editing && editing !== 'new' && editing.id === p.id);
  const pill = (p: Product) => {
    const tone = stockTone(p);
    return p.active ? (
      <span className={`prd-pill prd-pill-${tone}`}>{tone === 'out' ? t('outOfStock') : tone === 'low' ? t('lowStock', { n: p.stock }) : t('inStock')}</span>
    ) : (
      <span className="prd-pill prd-pill-off">{t('retired')}</span>
    );
  };
  const nothing = <div className="empty">{search.trim().length >= 2 ? t('noMatch', { q: search.trim() }) : t(`filters.none.${filter}`)}</div>;
  const list =
    shown.length === 0 ? (
      nothing
    ) : (
      <ul className="prd-list">
        {pageRows.map((p) => {
          const tone = stockTone(p);
          return (
            <li key={p.id} className={`prd-row ${p.active ? '' : 'prd-row-retired'}`}>
              <button
                type="button"
                className={`prd-row-tap ${isOn(p) ? 'is-on' : ''}`}
                aria-current={isOn(p) ? 'true' : undefined}
                onClick={() => (writable ? setEditing(p) : undefined)}
                disabled={!writable}
              >
                <img className="prd-photo" src={productPhotoUrl(p)} alt="" loading="lazy" />
                <span className="prd-name">
                  {p.name}
                  {p.categoryName ? <span className="prd-name-cat">{p.categoryName}</span> : null}
                </span>
                <span className="prd-price">{formatMoney(p.priceMinor)}</span>
                <span className="prd-meta">
                  {p.active ? (
                    <span className={`prd-pill prd-pill-${tone}`}>{tone === 'out' ? t('outOfStock') : tone === 'low' ? t('lowStock', { n: p.stock }) : t('stock', { n: p.stock })}</span>
                  ) : (
                    <span className="prd-pill prd-pill-off">{t('stock', { n: p.stock })}</span>
                  )}
                  <span className="prd-sold">{t('sold', { n: p.sold })}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  const table =
    shown.length === 0 ? (
      nothing
    ) : (
      <div className="table-scroll">
        <table className="prd-table">
          <thead>
            <tr>
              <th>{t('cols.product')}</th>
              <th className="prd-td-num">{t('cols.price')}</th>
              <th className="prd-td-num">{t('cols.cost')}</th>
              <th className="prd-td-num">{t('cols.stock')}</th>
              <th>{t('cols.status')}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p) => (
              <tr
                key={p.id}
                className={`prd-tr ${isOn(p) ? 'is-on' : ''} ${p.active ? '' : 'prd-row-retired'}`}
                aria-current={isOn(p) ? 'true' : undefined}
                onClick={() => (writable ? setEditing(p) : undefined)}
              >
                <td>
                  {/* The row opens on a click anywhere; the name is a real button so a keyboard or a screen reader reaches it. */}
                  <button
                    type="button"
                    className="prd-cell-name prd-cell-tap"
                    disabled={!writable}
                    aria-current={isOn(p) ? 'true' : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (writable) setEditing(p);
                    }}
                  >
                    <img className="prd-photo" src={productPhotoUrl(p)} alt="" loading="lazy" />
                    <span className="prd-name">
                      {p.name}
                      <span className="prd-name-cat">{p.categoryName ?? t('categories.none')}</span>
                    </span>
                  </button>
                </td>
                <td className="prd-td-num">{formatMoney(p.priceMinor)}</td>
                <td className="prd-td-num prd-td-muted">{p.costMinor != null ? formatMoney(p.costMinor) : '—'}</td>
                <td className="prd-td-num">
                  <span className={`prd-td-stock prd-td-stock-${stockTone(p)}`}>{p.stock}</span>
                  <span className="prd-td-sold">{t('sold', { n: p.sold })}</span>
                </td>
                <td>{pill(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  const pages = shown.length > PAGE_SIZE ? <Pagination page={Math.min(page, pageCount)} total={shown.length} pageSize={PAGE_SIZE} noun={t('noun')} onChange={setPage} /> : null;
  const sheet = (inline: boolean) =>
    editing ? (
      <ProductSheet
        key={editing === 'new' ? 'new' : editing.id}
        product={editing === 'new' ? null : editing}
        branchId={branchId}
        categories={categories}
        onSaved={saved}
        onDelete={(p) => setDeleting(p)}
        onClose={() => setEditing(null)}
        inline={inline}
      />
    ) : null;
  const dialogs = (
    <>
      {deleting ? (
        <ConfirmDialog
          title={t('delete')}
          body={t('deleteAsk', { name: deleting.name })}
          confirmLabel={t('delete')}
          tone="danger"
          busy={busy}
          error={error}
          onConfirm={() => void remove()}
          onCancel={() => {
            setDeleting(null);
            setError(null);
          }}
        />
      ) : null}
      {deletingCategory ? (
        <ConfirmDialog
          title={t('categories.delete')}
          body={t('categories.deleteAsk', { name: deletingCategory.name, n: deletingCategory.count })}
          confirmLabel={t('categories.delete')}
          tone="danger"
          busy={busy}
          error={error}
          onConfirm={() => void removeCategory()}
          onCancel={() => {
            setDeletingCategory(null);
            setError(null);
          }}
        />
      ) : null}
    </>
  );

  if (desk === null) {
    return (
      <>
        {header}
        <div className="page-body" aria-busy="true" />
      </>
    );
  }

  if (desk && rows.length > 0) {
    return (
      <>
        {header}
        <div className="page-body prd-desk">
          <div className="pf-wide-grid prd-desk-grid">
            <aside className="pf-wide-left prd-desk-left" aria-label={t('categories.title')}>
              {strip}
              <DeskProductCategories
                picked={category}
                categories={categories}
                allCount={live.length}
                noneCount={noneCount}
                onPick={(id) => pick(() => setCategory(id))}
                onAdd={writable ? addCategory : undefined}
                onDelete={writable ? (c) => setDeletingCategory(c) : undefined}
              />
            </aside>
            <section className="pf-wide-mid prd-desk-mid" aria-label={t('title')}>
              <div className="prd-desk-tools">
                {searchBox}
                {sortBox}
              </div>
              {chips}
              <div className="card prd-desk-card">
                {table}
                {pages}
              </div>
            </section>
            <aside className="pf-wide-right prd-desk-right" aria-label={t('form.titleEdit')}>
              {editing ? (
                sheet(true)
              ) : (
                <div className="svc-desk-nothing">
                  <p>{t('deskPick')}</p>
                </div>
              )}
            </aside>
          </div>
          {dialogs}
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="page-body prd-page">
        {rows.length === 0 ? (
          <div className="empty prd-empty">
            <p>{t('empty')}</p>
            <p className="prd-empty-hint">{t('emptyHint')}</p>
          </div>
        ) : (
          <>
            {strip}
            <div className="prd-tools">
              {searchBox}
              {categories.length > 0 ? (
                <div className="prd-selects">
                  {categorySelect}
                  {sortBox}
                </div>
              ) : (
                sortBox
              )}
              {chips}
            </div>
            {list}
            {pages}
          </>
        )}
      </div>
      {sheet(false)}
      {dialogs}
    </>
  );
}
