'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, formatMoney } from '../lib/api';
import type { Product, ProductCategory } from '../lib/api-types';
import { PageHeader } from '../components/PageHeader';
import { WriteOnly } from '../components/WriteOnly';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Pagination, PAGE_SIZE } from '../components/Pagination';
import { useSession, useWritable } from '../components/SessionProvider';
import { IconCart, IconPlus, IconSearch, IconSort } from '../components/icons';
import { productPhotoUrl } from '../lib/service-photos';
import { matchItems } from '../lib/service-match';
import { productMatchable } from '../lib/product-match';
import { ProductSheet } from './ProductSheet';
import { StockTake } from './StockTake';
import { ALL_CATEGORIES, NO_CATEGORY, ProductCategoriesDropdown } from './DeskProductCategories';

/**
 * Owner, 2026-10-14 — the shelf, the way a stock screen is read.
 *
 * Phone & wide desk: horizontal KPI strip + Top sellers sales graph across the top, then a toolbar with Search,
 * multi-select Categories dropdown, Sort, and status chips. Wide desk (≥1101px) shows the sortable table on the left
 * and the product sheet drawn in place on the right.
 *
 * Nothing here names a kind of business: the same screen sells a clinic's consumables and a gym's protein.
 */
export type ShelfFilter = 'all' | 'inStock' | 'low' | 'out' | 'retired';
export const SHELF_FILTERS: readonly ShelfFilter[] = ['all', 'inStock', 'low', 'out', 'retired'];
export type ShelfSort = 'name' | 'stock' | 'sold' | 'price' | 'cost' | 'status';
export const SHELF_SORTS: readonly ShelfSort[] = ['name', 'stock', 'sold', 'price', 'cost', 'status'];
export type ShelfSortDir = 'asc' | 'desc';
export const defaultSortDir = (sort: ShelfSort): ShelfSortDir =>
  sort === 'name' || sort === 'stock' || sort === 'status' ? 'asc' : 'desc';

/** The pill's colour: red at zero, amber at or under the owner's line, green otherwise. Retired products carry no pill. */
export const stockTone = (p: Pick<Product, 'stock' | 'lowStockAt' | 'active'>): 'ok' | 'low' | 'out' => (p.stock <= 0 ? 'out' : p.lowStockAt > 0 && p.stock <= p.lowStockAt ? 'low' : 'ok');

/** What the shelf is worth at the shelf price, counting only what is actually there. */
export const shelfWorthMinor = (rows: readonly Pick<Product, 'stock' | 'priceMinor' | 'active'>[]): number =>
  rows.reduce((sum, p) => sum + (p.active && p.stock > 0 ? p.stock * Number(p.priceMinor) : 0), 0);

export function matchesCategories(
  p: Pick<Product, 'categoryId'>,
  category: string | readonly string[] = ALL_CATEGORIES,
): boolean {
  if (Array.isArray(category)) {
    if (category.length === 0) return true;
    return category.some((c) => (c === NO_CATEGORY ? p.categoryId === null : p.categoryId === c));
  }
  if (category === ALL_CATEGORIES) return true;
  if (category === NO_CATEGORY) return p.categoryId === null;
  return p.categoryId === category;
}

/**
 * The category first, the chip second, then the search — the same spelling-tolerant matcher the till uses (GRW-375), from the second letter.
 * Jira GRW-574 — the search also finds a product by its SKU or barcode, whole or from the start.
 */
export function filterShelf(
  rows: readonly Product[],
  filter: ShelfFilter,
  search: string,
  category: string | readonly string[] = ALL_CATEGORIES,
): Product[] {
  const pool = rows.filter((p) => {
    if (!matchesCategories(p, category)) return false;
    if (filter === 'retired') return !p.active;
    if (!p.active) return false;
    const tone = stockTone(p);
    if (filter === 'inStock') return tone === 'ok';
    if (filter === 'low') return tone !== 'ok';
    if (filter === 'out') return tone === 'out';
    return true;
  });
  const q = search.trim();
  return q.length >= 2 ? matchItems(pool.map(productMatchable), q) : pool;
}

const statusRank = (p: Pick<Product, 'stock' | 'lowStockAt' | 'active'>): number => {
  const tone = stockTone(p);
  return tone === 'out' ? 0 : tone === 'low' ? 1 : 2;
};

export function sortShelf(rows: readonly Product[], sort: ShelfSort, dir: ShelfSortDir = defaultSortDir(sort)): Product[] {
  const sign = dir === 'asc' ? 1 : -1;
  const byName = (a: Product, b: Product) => a.name.localeCompare(b.name);
  return [...rows].sort((a, b) => {
    if (sort === 'name') return sign * byName(a, b);
    if (sort === 'price') return sign * (Number(a.priceMinor) - Number(b.priceMinor)) || byName(a, b);
    if (sort === 'cost') {
      if (a.costMinor == null && b.costMinor == null) return byName(a, b);
      if (a.costMinor == null) return 1;
      if (b.costMinor == null) return -1;
      return sign * (Number(a.costMinor) - Number(b.costMinor)) || byName(a, b);
    }
    if (sort === 'stock') return sign * (a.stock - b.stock) || byName(a, b);
    if (sort === 'sold') return sign * (a.sold - b.sold) || byName(a, b);
    if (a.active !== b.active) return a.active ? -1 : 1;
    return sign * (statusRank(a) - statusRank(b)) || a.stock - b.stock || byName(a, b);
  });
}

function SortableTh({
  col,
  label,
  sort,
  dir,
  onSort,
  numeric,
}: {
  col: ShelfSort;
  label: string;
  sort: ShelfSort;
  dir: ShelfSortDir;
  onSort: (col: ShelfSort) => void;
  numeric?: boolean;
}) {
  const active = sort === col;
  return (
    <th
      className={numeric ? 'th-sortable prd-td-num' : 'th-sortable'}
      aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}
    >
      <button type="button" onClick={() => onSort(col)}>
        {label}
        <span className={`th-arrow ${active ? 'is-on' : ''}`} aria-hidden="true">
          {active ? (dir === 'desc' ? '↓' : '↑') : <IconSort />}
        </span>
      </button>
    </th>
  );
}

export function ProductsList({ products, categories: initialCategories, branchId }: { products: Product[]; categories: ProductCategory[]; branchId: string }) {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const router = useRouter();
  const session = useSession();
  const writable = useWritable();
  const canStockTake =
    session?.role === null || session?.role === undefined || session?.role === 'owner' || session?.role === 'manager';
  const [rows, setRows] = useState(products);
  const [categories, setCategories] = useState(initialCategories);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const [sort, setSort] = useState<ShelfSort>('name');
  const [sortDir, setSortDir] = useState<ShelfSortDir>('asc');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [stockTakeOpen, setStockTakeOpen] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ProductCategory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const inCategory = useMemo(() => filterShelf(rows, 'all', '', selectedCategories), [rows, selectedCategories]);
  const shown = useMemo(
    () => sortShelf(filterShelf(rows, filter, search, selectedCategories), sort, sortDir),
    [rows, filter, search, selectedCategories, sort, sortDir],
  );
  const counts: Record<ShelfFilter, number> = {
    all: inCategory.length,
    inStock: inCategory.filter((p) => stockTone(p) === 'ok').length,
    low: inCategory.filter((p) => stockTone(p) !== 'ok').length,
    out: inCategory.filter((p) => p.stock <= 0).length,
    retired: rows.filter((p) => !p.active && matchesCategories(p, selectedCategories)).length,
  };
  const noneCount = live.filter((p) => p.categoryId === null).length;
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageRows = shown.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);
  const pick = (f: () => void) => {
    f();
    setPage(1);
  };
  const toggleCategory = (id: string) =>
    pick(() =>
      setSelectedCategories((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    );
  const clearCategories = () => pick(() => setSelectedCategories([]));
  const pickColumnSort = (col: ShelfSort) =>
    pick(() => {
      if (sort === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      else {
        setSort(col);
        setSortDir(defaultSortDir(col));
      }
    });

  useEffect(() => {
    if (savedId && (!editing || editing === 'new' || editing.id !== savedId)) setSavedId(null);
  }, [editing, savedId]);
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
    setSavedId(editing === 'new' ? p.id : null);
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
      setSelectedCategories((prev) => prev.filter((id) => id !== deletingCategory.id));
      setDeletingCategory(null);
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const stockTakeSaved = (updated: Product[]) => {
    setRows((prev) => {
      const byId = new Map(updated.map((p) => [p.id, p]));
      const seen = new Set(prev.map((x) => x.id));
      const next = [...prev.map((x) => byId.get(x.id) ?? x), ...updated.filter((p) => !seen.has(p.id))];
      return next.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    });
    setEditing((cur) => {
      if (!cur || cur === 'new') return cur;
      return updated.find((p) => p.id === cur.id) ?? cur;
    });
    router.refresh();
  };

  const header = (
    <PageHeader
      title={t('title')}
      subtitle={t('subtitle')}
      actions={
        <WriteOnly>
          {live.length > 0 ? (
            <Link className="btn btn-ghost" href="/products/sell?from=products">
              <IconCart /> {t('sell')}
            </Link>
          ) : null}
          {live.length > 0 && canStockTake ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditing((cur) => (cur === 'new' ? null : cur));
                setStockTakeOpen(true);
              }}
            >
              {t('stockTake.open')}
            </button>
          ) : null}
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
      {/* The listitem is the wrapper: a role on the button itself would strip its button role for a screen reader. */}
      <div role="listitem" className="prd-stat-cell">
        <button type="button" className={`prd-stat prd-stat-tap ${lowCount > 0 ? 'prd-stat-low' : ''}`} onClick={() => pick(() => setFilter(lowCount > 0 ? 'low' : 'all'))}>
          <span className="prd-stat-n">{lowCount}</span>
          <span className="prd-stat-l">{t('strip.low')}</span>
        </button>
      </div>
    </div>
  );
  const searchBox = (
    <label className="search-wrap prd-search">
      <IconSearch />
      <input type="text" className="search-input search-input-bare" placeholder={t('searchPlaceholder')} value={search} onChange={(e) => pick(() => setSearch(e.target.value))} />
    </label>
  );
  const categoriesDropdown =
    categories.length > 0 || noneCount > 0 || writable ? (
      <ProductCategoriesDropdown
        selected={selectedCategories}
        categories={categories}
        noneCount={noneCount}
        onToggle={toggleCategory}
        onClear={clearCategories}
        onAdd={writable ? addCategory : undefined}
        onDelete={writable ? (c) => setDeletingCategory(c) : undefined}
      />
    ) : null;
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
  const sortReversed = sortDir !== defaultSortDir(sort);
  const sortBox = (
    <label className="prd-sort">
      <span className="prd-sort-l">{t('sort.label')}</span>
      <select
        value={sortReversed ? `${sort}:${sortDir}` : sort}
        onChange={(e) => {
          const next = e.target.value as ShelfSort;
          pick(() => {
            setSort(next);
            setSortDir(defaultSortDir(next));
          });
        }}
      >
        {sortReversed ? (
          <option value={`${sort}:${sortDir}`} disabled>
            {sort === 'sold' ? t('sort.sold') : t(`cols.${sort === 'name' ? 'product' : sort}`)} ({sortDir === 'desc' ? '↓' : '↑'})
          </option>
        ) : null}
        {SHELF_SORTS.map((s) => (
          <option key={s} value={s}>
            {t(`sort.${s}`)}
          </option>
        ))}
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
              <SortableTh col="name" label={t('cols.product')} sort={sort} dir={sortDir} onSort={pickColumnSort} />
              <SortableTh col="price" label={t('cols.price')} sort={sort} dir={sortDir} onSort={pickColumnSort} numeric />
              <SortableTh col="cost" label={t('cols.cost')} sort={sort} dir={sortDir} onSort={pickColumnSort} numeric />
              <SortableTh col="stock" label={t('cols.stock')} sort={sort} dir={sortDir} onSort={pickColumnSort} numeric />
              <SortableTh col="status" label={t('cols.status')} sort={sort} dir={sortDir} onSort={pickColumnSort} />
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
        initialSaved={editing !== 'new' && savedId === editing.id}
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

  if (stockTakeOpen) {
    return (
      <StockTake
        key={branchId}
        branchId={branchId}
        initialProducts={rows}
        categories={categories}
        initialCategories={selectedCategories}
        initialSearch={search}
        onSaved={stockTakeSaved}
        onCancel={() => setStockTakeOpen(false)}
      />
    );
  }

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
          {strip}
          <div className="pf-wide-grid prd-desk-grid">
            <section className="pf-wide-mid prd-desk-mid" aria-label={t('title')}>
              <div className="prd-desk-tools">
                {searchBox}
                {categoriesDropdown}
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
              {categoriesDropdown ? (
                <div className="prd-selects">
                  {categoriesDropdown}
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

