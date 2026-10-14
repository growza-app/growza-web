'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, formatMoney } from '../lib/api';
import type { Product } from '../lib/api-types';
import { PageHeader } from '../components/PageHeader';
import { WriteOnly } from '../components/WriteOnly';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useWritable } from '../components/SessionProvider';
import { IconPlus, IconSearch } from '../components/icons';
import { productPhotoUrl } from '../lib/service-photos';
import { asMinor, matchItems } from '../lib/service-match';
import { ProductSheet } from './ProductSheet';

/**
 * Owner, 2026-10-14 — the shelf, the way a stock screen is read: three numbers first (how many products, what
 * the stock is worth, how many are running low), then a search and four chips, then a row per product with a
 * green / amber / red stock pill. Tapping a row opens the sheet: Details, or Stock with the ledger (0116).
 *
 * Nothing here names a kind of business: the same screen sells a clinic's consumables and a gym's protein.
 */
export type ShelfFilter = 'all' | 'low' | 'out' | 'retired';
export const SHELF_FILTERS: readonly ShelfFilter[] = ['all', 'low', 'out', 'retired'];

/** The pill's colour: red at zero, amber at or under the owner's line, green otherwise. Retired products carry no pill. */
export const stockTone = (p: Pick<Product, 'stock' | 'lowStockAt' | 'active'>): 'ok' | 'low' | 'out' => (p.stock <= 0 ? 'out' : p.lowStockAt > 0 && p.stock <= p.lowStockAt ? 'low' : 'ok');

/** What the shelf is worth at the shelf price, counting only what is actually there. */
export const shelfWorthMinor = (rows: readonly Pick<Product, 'stock' | 'priceMinor' | 'active'>[]): number =>
  rows.reduce((sum, p) => sum + (p.active && p.stock > 0 ? p.stock * Number(p.priceMinor) : 0), 0);

/** The chip first, then the search — the same spelling-tolerant matcher the till and Services use (GRW-375): "shampo" finds Shampoo. */
export function filterShelf(rows: readonly Product[], filter: ShelfFilter, search: string): Product[] {
  const pool = rows.filter((p) => {
    if (filter === 'retired') return !p.active;
    if (!p.active) return false;
    const tone = stockTone(p);
    if (filter === 'low') return tone !== 'ok';
    if (filter === 'out') return tone === 'out';
    return true;
  });
  // One letter matches half the shelf and reads as a broken search; the matching starts at two.
  const q = search.trim();
  return q.length >= 2 ? matchItems(pool.map((p) => ({ item: p, text: [p.name], priceMinor: asMinor(p.priceMinor) })), q) : pool;
}

export function ProductsList({ products, branchId }: { products: Product[]; branchId: string }) {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const router = useRouter();
  const writable = useWritable();
  const [rows, setRows] = useState(products);
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The wide screen is three panels — status · the shelf · the product — the way Services and the till are. `null` until the width is known. */
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
  const shown = useMemo(() => filterShelf(rows, filter, search), [rows, filter, search]);
  const counts: Record<ShelfFilter, number> = {
    all: live.length,
    low: lowCount,
    out: live.filter((p) => p.stock <= 0).length,
    retired: rows.length - live.length,
  };

  const saved = (p: Product) => {
    setRows((prev) => {
      const at = prev.findIndex((x) => x.id === p.id);
      const next = at >= 0 ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p];
      return [...next].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    });
    setEditing((cur) => (cur && cur !== 'new' && cur.id === p.id ? p : cur === 'new' ? p : cur));
    router.refresh();
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProduct(deleting.id);
      setRows((prev) => prev.filter((x) => x.id !== deleting.id));
      setDeleting(null);
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
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
      <button type="button" className={`prd-stat prd-stat-tap ${lowCount > 0 ? 'prd-stat-low' : ''}`} role="listitem" onClick={() => setFilter(lowCount > 0 ? 'low' : 'all')}>
        <span className="prd-stat-n">{lowCount}</span>
        <span className="prd-stat-l">{t('strip.low')}</span>
      </button>
    </div>
  );
  const searchBox = (
    <label className="search-wrap prd-search">
      <IconSearch />
      <input type="text" className="search-input search-input-bare" placeholder={t('searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
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
          onClick={() => setFilter(f)}
        >
          {t(`filters.${f}`)} <span className="prd-chip-n">{counts[f]}</span>
        </button>
      ))}
    </div>
  );
  const list =
    shown.length === 0 ? (
      <div className="empty">{search ? t('noMatch', { q: search.trim() }) : t(`filters.none.${filter}`)}</div>
    ) : (
      <ul className="prd-list">
        {shown.map((p) => {
          const tone = stockTone(p);
          return (
            <li key={p.id} className={`prd-row ${p.active ? '' : 'prd-row-retired'}`}>
              <button
                type="button"
                className={`prd-row-tap ${editing && editing !== 'new' && editing.id === p.id ? 'is-on' : ''}`}
                aria-current={editing && editing !== 'new' && editing.id === p.id ? 'true' : undefined}
                onClick={() => (writable ? setEditing(p) : undefined)}
                disabled={!writable}
              >
                <img className="prd-photo" src={productPhotoUrl(p)} alt="" loading="lazy" />
                <span className="prd-name">
                  {p.name}
                  {!p.active ? <span className="chip prd-chip-retired">{t('retired')}</span> : null}
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
  const sheet = (inline: boolean) =>
    editing ? (
      <ProductSheet
        key={editing === 'new' ? 'new' : editing.id}
        product={editing === 'new' ? null : editing}
        branchId={branchId}
        onSaved={saved}
        onDelete={(p) => setDeleting(p)}
        onClose={() => setEditing(null)}
        inline={inline}
      />
    ) : null;
  const dialogs = deleting ? (
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
  ) : null;

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
            <aside className="pf-wide-left prd-desk-left" aria-label={t('filters.label')}>
              {strip}
              <h2 className="pf-wide-h">{t('filters.label')}</h2>
              <ul className="svc-desk-cats">
                {SHELF_FILTERS.map((f) => (
                  <li key={f}>
                    <button type="button" className={`svc-desk-cat ${filter === f ? 'is-on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      <span className="svc-desk-cat-name">{t(`filters.${f}`)}</span>
                      <span className="svc-desk-n">{counts[f]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
            <section className="pf-wide-mid prd-desk-mid" aria-label={t('title')}>
              {searchBox}
              <div className="prd-desk-scroll">{list}</div>
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
              {chips}
            </div>
            {list}
          </>
        )}
      </div>
      {sheet(false)}
      {dialogs}
    </>
  );
}
