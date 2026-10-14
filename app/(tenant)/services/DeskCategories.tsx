'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { IconPlus } from '../components/icons';
import { ALL_TAB, RETIRED_TAB, type ServiceTab } from './services-tabs';
import type { CategoryOption } from './CategoryPicker';

/**
 * Owner, 2026-10-14 — the left panel of the wide Services screen: the categories, always in view.
 *
 * On a phone the categories are a disclosure (`CategoryPicker`, GRW-587) because a strip of 23 of them does
 * not fit in 343px. A desk has a column to spare, so they are a list: All, each category with its count,
 * Retired when there is anything retired. Tapping one is the same `tab` the picker sets — nothing below this
 * line knows which control chose it.
 *
 * Adding a category is a row at the foot, as the sheet has it (GRW-591). Renaming, reordering and deleting stay
 * in `CategoriesSheet`, behind Edit: those are the destructive jobs, and a list that both selects and deletes
 * turns every mis-click into a destructive one (GRW-587's argument, kept).
 */
export function DeskCategories({
  tab,
  categories,
  counts,
  showRetired,
  onPick,
  onAdd,
  onManage,
  managing = false,
}: {
  tab: ServiceTab;
  categories: readonly CategoryOption[];
  counts: { all: number; retired: number; byCategory: Map<string, number> };
  showRetired: boolean;
  onPick: (tab: ServiceTab) => void;
  /** Absent when the business is read-only. */
  onAdd?: (name: string) => Promise<void>;
  onManage?: () => void;
  managing?: boolean;
}) {
  const t = useTranslations('services');
  const tc = useTranslations('services.categories');
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (addOpen) addRef.current?.focus();
  }, [addOpen]);

  const closeAdd = () => {
    setAddOpen(false);
    setAdding('');
    setError(null);
  };

  const add = async () => {
    const name = adding.trim();
    if (!name || !onAdd) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(name);
      setAdding('');
      // The field stays open: a salon filling in its menu adds several in a row, not one.
      addRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : tc('errors.failed'));
    } finally {
      setBusy(false);
    }
  };

  const row = (id: ServiceTab, name: string, n: number) => (
    <li key={id}>
      <button type="button" className={`svc-desk-cat ${tab === id ? 'is-on' : ''}`} aria-pressed={tab === id} onClick={() => onPick(id)}>
        <span className="svc-desk-cat-name">{name}</span>
        <span className="svc-desk-n">{n}</span>
      </button>
    </li>
  );

  return (
    <aside className="pf-wide-left svc-desk-left" aria-label={tc('title')}>
      <div className="svc-desk-left-head">
        <h2 className="pf-wide-h">{tc('title')}</h2>
        {onManage && (
          <button type="button" className="svc-desk-manage" disabled={managing} onClick={onManage}>
            {managing ? '…' : tc('edit')}
          </button>
        )}
      </div>
      <ul className="svc-desk-cats">
        {row(ALL_TAB, t('all'), counts.all)}
        {categories.map((c) => row(c.id, c.name, counts.byCategory.get(c.id) ?? 0))}
        {showRetired && row(RETIRED_TAB, t('retired'), counts.retired)}
      </ul>
      {onAdd &&
        (addOpen ? (
          <div className="svc-desk-addcat">
            <input
              ref={addRef}
              type="text"
              value={adding}
              maxLength={60}
              placeholder={tc('addPlaceholder')}
              aria-label={tc('addPlaceholder')}
              disabled={busy}
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add();
                if (e.key === 'Escape') closeAdd();
              }}
            />
            <div className="svc-desk-addcat-actions">
              <button type="button" className="btn" disabled={busy || !adding.trim()} onClick={() => void add()}>
                {tc('add')}
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={closeAdd}>
                {tc('cancel')}
              </button>
            </div>
            {error && <p role="alert" className="field-error">{error}</p>}
          </div>
        ) : (
          <button type="button" className="svc-cat-addrow svc-desk-addrow" onClick={() => setAddOpen(true)}>
            <IconPlus />
            <span>{tc('addOpen')}</span>
          </button>
        ))}
    </aside>
  );
}
