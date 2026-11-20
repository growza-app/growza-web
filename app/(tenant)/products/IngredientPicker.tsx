'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { StockMaterial } from '../lib/api-types';
import { IconSearch } from '../components/icons';

/**
 * Owner, 2026-11-20 — "in recipe, add ingredient should also have search, as a long list can take time". A kitchen
 * keeps sixty items; scrolling a native select for "Kasuri Methi" was the slow part of writing a recipe. This box
 * filters as you type (name or group), and a tap, or the arrows and Enter, adds the item; the box clears and keeps
 * its focus for the next one. Opened without typing, it lists every item not yet in the recipe, A to Z.
 *
 * The same combobox the walk-in sheet's client search is (`NewVisitSheet.tsx`): arrows move, Enter picks, Escape
 * closes the list and not the sheet, and a tap on a row is not lost to the box blurring first.
 */
export function rankIngredients<T extends Pick<StockMaterial, 'id' | 'name' | 'category'>>(items: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  const byName = [...items].sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return byName;
  const score = (m: Pick<StockMaterial, 'name' | 'category'>): number => {
    const name = m.name.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.split(/[\s()/-]+/).some((w) => w.startsWith(q))) return 1;
    if (name.includes(q)) return 2;
    if ((m.category ?? '').toLowerCase().includes(q)) return 3;
    return -1;
  };
  return byName
    .map((m) => ({ m, s: score(m) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.m);
}

export function IngredientPicker({ items, onPick }: { items: readonly StockMaterial[]; onPick: (m: StockMaterial) => void }) {
  const t = useTranslations('recipe');
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const results = useMemo(() => rankIngredients(items, query), [items, query]);
  const showDrop = open;
  // A phone draws the list in the sheet's flow (99-kitchen-stock.css): bring it into view, or it opens below the fold.
  useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, query]);

  const pick = (m: StockMaterial) => {
    onPick(m);
    setQuery('');
    setActiveIdx(-1);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div
      className="rc-combo"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label className="search-wrap rc-search">
        <IconSearch />
        <input
          ref={inputRef}
          type="search"
          className="search-input search-input-bare"
          role="combobox"
          aria-label={t('add')}
          aria-expanded={showDrop}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showDrop && activeIdx >= 0 ? `${id}-opt-${activeIdx}` : undefined}
          placeholder={`+ ${t('add')}`}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(e.target.value.trim() ? 0 : -1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActiveIdx((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIdx((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter' && activeIdx >= 0 && results[activeIdx]) {
              e.preventDefault();
              pick(results[activeIdx]);
            } else if (e.key === 'Escape') {
              // The list closes; the sheet around it stays open.
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </label>
      {showDrop ? (
        <ul ref={listRef} className="rc-dropdown" id={listId} role="listbox" aria-label={t('add')}>
          {results.length === 0 ? (
            <li className="rc-empty">{t('noMatch', { q: query.trim() })}</li>
          ) : (
            results.map((m, i) => (
              <li
                key={m.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-label={m.name}
                aria-selected={i === activeIdx}
                className={`rc-opt ${i === activeIdx ? 'is-active' : ''}`}
                onPointerDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => pick(m)}
              >
                <span className="rc-opt-name">{m.name}</span>
                {m.category ? <span className="rc-opt-cat">{m.category}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
