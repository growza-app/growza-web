'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ProductCategory } from '../lib/api-types';
import { IconChevronDown, IconPlus, IconSearch } from '../components/icons';

export const ALL_CATEGORIES = '';
export const NO_CATEGORY = '\u0000none';

/**
 * Owner, 2026-10-14 (0117) — the left column of the wide Products screen: the shelf's categories, as the
 * Services desk has them (`DeskCategories`). All with the live count, each category with its own, Uncategorised
 * when anything has none, and a row to add one. Deleting is behind Edit, so a mis-click cannot be destructive.
 */
export function DeskProductCategories({
  picked,
  categories,
  allCount,
  noneCount,
  onPick,
  onAdd,
  onDelete,
}: {
  picked: string;
  categories: readonly ProductCategory[];
  allCount: number;
  noneCount: number;
  onPick: (id: string) => void;
  onAdd?: (name: string) => Promise<void>;
  onDelete?: (c: ProductCategory) => void;
}) {
  const t = useTranslations('products.categories');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (addOpen) addRef.current?.focus();
  }, [addOpen]);

  const add = async () => {
    const name = adding.trim();
    if (!name || !onAdd) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(name);
      setAdding('');
      addRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  const row = (id: string, name: string, n: number, c?: ProductCategory) => (
    <li key={id || 'all'} className="prd-cat-li">
      <button type="button" className={`svc-desk-cat ${picked === id ? 'is-on' : ''}`} aria-pressed={picked === id} onClick={() => onPick(id)}>
        <span className="svc-desk-cat-name" title={name}>
          {name}
        </span>
        <span className="svc-desk-n">{n}</span>
      </button>
      {editing && c && onDelete ? (
        <button type="button" className="prd-cat-del" aria-label={t('deleteNamed', { name })} onClick={() => onDelete(c)}>
          ×
        </button>
      ) : null}
    </li>
  );

  return (
    <>
      <div className="svc-desk-left-head">
        <h2 className="pf-wide-h">{t('title')}</h2>
        {onDelete && categories.length > 0 ? (
          <button type="button" className="svc-desk-manage" onClick={() => setEditing((v) => !v)}>
            {editing ? t('done') : t('edit')}
          </button>
        ) : null}
      </div>
      <ul className="svc-desk-cats">
        {row(ALL_CATEGORIES, t('all'), allCount)}
        {categories.map((c) => row(c.id, c.name, c.count, c))}
        {noneCount > 0 ? row(NO_CATEGORY, t('none'), noneCount) : null}
      </ul>
      {onAdd &&
        (addOpen ? (
          <div className="svc-desk-addcat">
            <input
              ref={addRef}
              type="text"
              value={adding}
              maxLength={60}
              placeholder={t('addPlaceholder')}
              aria-label={t('addPlaceholder')}
              disabled={busy}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add();
                if (e.key === 'Escape') {
                  setAddOpen(false);
                  setAdding('');
                  setError(null);
                }
              }}
            />
            <div className="svc-desk-addcat-actions">
              <button type="button" className="btn" disabled={busy || !adding.trim()} onClick={() => void add()}>
                {t('add')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => {
                  setAddOpen(false);
                  setAdding('');
                  setError(null);
                }}
              >
                {t('cancel')}
              </button>
            </div>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
          </div>
        ) : (
          <button type="button" className="svc-cat-addrow svc-desk-addrow" onClick={() => setAddOpen(true)}>
            <IconPlus />
            {t('addRow')}
          </button>
        ))}
    </>
  );
}

/**
 * Owner, 2026-10-17 — Multi-select Categories filter dropdown on the Products and Count stock screens,
 * using the same `.sls-dd` checkbox + search dropdown pattern as Sales.
 */
export function ProductCategoriesDropdown({
  selected,
  categories,
  noneCount,
  onToggle,
  onClear,
  onAdd,
  onDelete,
}: {
  selected: readonly string[];
  categories: readonly ProductCategory[];
  noneCount: number;
  onToggle: (id: string) => void;
  onClear: () => void;
  onAdd?: (name: string) => Promise<void>;
  onDelete?: (c: ProductCategory) => void;
}) {
  const t = useTranslations('products.categories');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLInputElement>(null);

  const closeMenu = () => {
    setOpen(false);
    setQuery('');
    setEditing(false);
    setAddOpen(false);
    setAdding('');
    setError(null);
  };

  useEffect(() => {
    if (addOpen) addRef.current?.focus();
  }, [addOpen]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (addOpen) {
        setAddOpen(false);
        setAdding('');
        setError(null);
        return;
      }
      closeMenu();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, addOpen]);

  const add = async () => {
    const name = adding.trim();
    if (!name || !onAdd) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(name);
      setAdding('');
      addRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  const q = query.trim().toLowerCase();
  const shownCats = q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  const showNone = (noneCount > 0 || selected.includes(NO_CATEGORY)) && (!q || t('none').toLowerCase().includes(q));

  return (
    <div className="sls-dd prd-cat-dd" ref={wrapRef}>
      <button
        type="button"
        className={`sls-dd-btn ${selected.length > 0 ? 'is-active' : ''}`}
        aria-expanded={open}
        onClick={() => (open ? closeMenu() : setOpen(true))}
      >
        <span>
          {t('title')}
          {selected.length > 0 ? ` (${selected.length})` : ''}
        </span>
        <IconChevronDown />
      </button>

      {open ? (
        <div className="sls-dd-menu prd-cat-dd-menu" role="group" aria-label={t('title')}>
          <div className="sls-dd-head">
            <label className="search-wrap sls-dd-search">
              <IconSearch />
              <input
                type="text"
                className="search-input search-input-bare"
                placeholder={t('searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {selected.length > 0 || query.trim() ? (
              <button
                type="button"
                className="sls-dd-clear"
                onClick={() => {
                  onClear();
                  setQuery('');
                }}
              >
                {t('clear')}
              </button>
            ) : null}
            {onDelete && categories.length > 0 ? (
              <button type="button" className="sls-dd-clear" onClick={() => setEditing((v) => !v)}>
                {editing ? t('done') : t('edit')}
              </button>
            ) : null}
          </div>

          <div className="sls-dd-list">
            {shownCats.length === 0 && !showNone ? (
              <div className="sls-dd-empty">{t('noMatch')}</div>
            ) : (
              <>
                {shownCats.map((c) => {
                  const checked = selected.includes(c.id);
                  return (
                    <div key={c.id} className="prd-cat-dd-row">
                      <label className="sls-check-row">
                        <input type="checkbox" checked={checked} onChange={() => onToggle(c.id)} />
                        <span className="sls-check-main">{c.name}</span>
                        <span className="sls-check-sub">({c.count})</span>
                      </label>
                      {editing && onDelete ? (
                        <button
                          type="button"
                          className="prd-cat-del"
                          aria-label={t('deleteNamed', { name: c.name })}
                          onClick={() => {
                            closeMenu();
                            onDelete(c);
                          }}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {showNone ? (
                  <label className="sls-check-row">
                    <input
                      type="checkbox"
                      checked={selected.includes(NO_CATEGORY)}
                      onChange={() => onToggle(NO_CATEGORY)}
                    />
                    <span className="sls-check-main">{t('none')}</span>
                    <span className="sls-check-sub">({noneCount})</span>
                  </label>
                ) : null}
              </>
            )}
          </div>

          {onAdd ? (
            <div className="prd-cat-dd-foot">
              {addOpen ? (
                <div className="svc-desk-addcat">
                  <input
                    ref={addRef}
                    type="text"
                    value={adding}
                    maxLength={60}
                    placeholder={t('addPlaceholder')}
                    aria-label={t('addPlaceholder')}
                    disabled={busy}
                    onChange={(e) => setAdding(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void add();
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setAddOpen(false);
                        setAdding('');
                        setError(null);
                      }
                    }}
                  />
                  <div className="svc-desk-addcat-actions">
                    <button type="button" className="btn" disabled={busy || !adding.trim()} onClick={() => void add()}>
                      {t('add')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => {
                        setAddOpen(false);
                        setAdding('');
                        setError(null);
                      }}
                    >
                      {t('cancel')}
                    </button>
                  </div>
                  {error && (
                    <p role="alert" className="field-error">
                      {error}
                    </p>
                  )}
                </div>
              ) : (
                <button type="button" className="svc-cat-addrow svc-desk-addrow" onClick={() => setAddOpen(true)}>
                  <IconPlus />
                  {t('addRow')}
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
