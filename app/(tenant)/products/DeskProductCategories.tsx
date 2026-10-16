'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { ProductCategory } from '../lib/api-types';
import { IconPlus } from '../components/icons';

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
