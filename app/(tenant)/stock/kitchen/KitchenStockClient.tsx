'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { KitchenStockList, StockMaterial } from '../../lib/api-types';
import { amount, parseAmount, unitWord } from '../../lib/kitchen-units';
import { useSession } from '../../components/SessionProvider';
import { MaterialSheet } from './MaterialSheet';

type Filter = 'low' | 'all' | 'noRecipe';

/**
 * Jira GRW-737 — the kitchen's raw materials at one branch: low ones first, below zero in red (BR-01: a count may go under, the kitchen
 * never stops), a dish with no recipe listed so the owner knows what is not tracked. The owner switches tracking on and types today's amounts
 * once; the owner and a manager add and change items; the counter and the cook read.
 */
export function KitchenStockClient({ branchId }: { branchId: string }) {
  const t = useTranslations('kitchenStock');
  const session = useSession();
  const grid = session?.areas?.pages;
  const isOwner = session?.role === 'owner';
  const mayChange = isOwner || (grid ? grid.services === 'manage' : session?.role === 'manager');

  const [data, setData] = useState<KitchenStockList | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<StockMaterial | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<Record<string, string>>({});
  const [openingSkipped, setOpeningSkipped] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await api.kitchenStock(branchId));
    } catch {
      setFailed(true);
    }
  }, [branchId]);
  useEffect(() => {
    void load();
  }, [load]);

  const materials = useMemo(() => data?.materials ?? [], [data]);
  const lowCount = materials.filter((m) => m.low).length;
  const unopened = materials.filter((m) => m.openedAt === null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = filter === 'low' ? materials.filter((m) => m.low) : materials;
    return q ? list.filter((m) => m.name.toLowerCase().includes(q) || (m.category ?? '').toLowerCase().includes(q)) : list;
  }, [materials, filter, query]);

  const say = (err: unknown) => setError(err instanceof ApiError ? err.message : t('saveFailed'));

  const toggle = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api.setKitchenStock(on);
      await load();
    } catch (err) {
      say(err);
    } finally {
      setBusy(false);
    }
  };

  const saveOpening = async () => {
    const entries: Array<{ materialId: string; qty: number }> = [];
    for (const m of unopened) {
      const text = opening[m.id]?.trim();
      if (!text) continue;
      const qty = parseAmount(text, m.unit, 'big', true);
      if (qty === null) {
        setError(`${m.name}: ${t('badQty')}`);
        return;
      }
      entries.push({ materialId: m.id, qty });
    }
    if (entries.length === 0) {
      setOpeningSkipped(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.openingStock(entries);
      setOpening({});
      await load();
    } catch (err) {
      say(err);
    } finally {
      setBusy(false);
    }
  };

  if (failed) {
    return (
      <div role="alert" className="ks-state ks-state-error">
        <p>{t('loadFailed')}</p>
        <button type="button" className="btn btn-ghost" onClick={() => void load()}>
          {t('retry')}
        </button>
      </div>
    );
  }
  if (data === null) {
    return (
      <ul className="ks-list" aria-busy="true" aria-label={t('loading')}>
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="ks-row ks-skel" aria-hidden="true" />
        ))}
      </ul>
    );
  }

  return (
    <div className="ks-body">
      {!data.on ? (
        <section className="ks-card ks-switch">
          <div className="ks-switch-copy">
            <strong>{t('switchTitle')}</strong>
            <span>{isOwner ? t('switchHint') : t('offNote')}</span>
          </div>
          {isOwner ? (
            <button type="button" className="btn ks-switch-btn" disabled={busy} onClick={() => void toggle(true)}>
              {t('switchOn')}
            </button>
          ) : null}
        </section>
      ) : null}

      {data.on && mayChange && unopened.length > 0 && !openingSkipped ? (
        <section className="ks-card ks-opening" aria-labelledby="ks-opening-title">
          <strong id="ks-opening-title">{t('openingTitle')}</strong>
          <span className="ks-hint">{t('openingHint')}</span>
          <ul className="ks-opening-list">
            {unopened.map((m) => (
              <li key={m.id} className="ks-opening-row">
                <label htmlFor={`ks-open-${m.id}`}>{m.name}</label>
                <span className="ks-qty-field">
                  <input
                    id={`ks-open-${m.id}`}
                    className="prd-input ks-qty-input"
                    inputMode="decimal"
                    placeholder="—"
                    value={opening[m.id] ?? ''}
                    onChange={(e) => setOpening((o) => ({ ...o, [m.id]: e.target.value }))}
                  />
                  <span className="ks-unit">{unitWord(m.unit)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="ks-pair">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setOpeningSkipped(true)}>
              {t('openingSkip')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void saveOpening()}>
              {busy ? t('saving') : t('openingSave')}
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <div role="alert" className="sheet-foot sheet-foot-error ks-error">
          {error}
        </div>
      ) : null}

      <input className="prd-input ks-search" type="search" placeholder={t('search')} aria-label={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="prd-chips" role="group" aria-label={t('filtersLabel')}>
        {(
          [
            ['low', lowCount],
            ['all', materials.length],
            ['noRecipe', data.noRecipe.length],
          ] as const
        ).map(([f, n]) => (
          <button
            key={f}
            type="button"
            className={`prd-chip ${filter === f ? 'prd-chip-on' : ''} ${f === 'low' && n > 0 ? 'prd-chip-warn' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {t(`filter.${f}`)} <span className="prd-chip-n">{n}</span>
          </button>
        ))}
      </div>

      {filter === 'noRecipe' ? (
        data.noRecipe.length === 0 ? (
          <p className="ks-state">{t('noRecipeNone')}</p>
        ) : (
          <>
            <p className="ks-hint">{t('noRecipeHint')}</p>
            <ul className="ks-list">
              {data.noRecipe.map((d) => (
                <li key={d.productId} className="ks-row">
                  <span className="ks-name">{d.name}</span>
                  {d.sizes.length > 0 ? <span className="ks-meta">{d.sizes.join(' · ')}</span> : null}
                </li>
              ))}
            </ul>
          </>
        )
      ) : materials.length === 0 ? (
        <div className="ks-state ks-empty">
          <strong>{t('emptyTitle')}</strong>
          <span>{t('emptyHint')}</span>
        </div>
      ) : shown.length === 0 ? (
        <p className="ks-state">{filter === 'low' && !query ? t('nothingLow') : t('noMatch')}</p>
      ) : (
        <ul className="ks-list">
          {shown.map((m) => {
            const tone = m.stock < 0 ? 'below' : m.low ? 'low' : '';
            const row = (
              <>
                <span className="ks-name">
                  {m.name}
                  {m.category ? <span className="ks-meta">{m.category}</span> : null}
                  {m.openedAt === null ? <span className="ks-meta">{t('notCounted')}</span> : null}
                </span>
                <span className={`ks-amount ${tone ? `is-${tone}` : ''}`}>
                  {amount(m.stock)} {unitWord(m.unit)}
                  {tone ? <span className="sr-only"> · {t(tone === 'below' ? 'below' : 'low')}</span> : null}
                </span>
              </>
            );
            return (
              <li key={m.id}>
                {mayChange ? (
                  <button type="button" className="ks-row ks-row-btn" onClick={() => setEditing(m)}>
                    {row}
                  </button>
                ) : (
                  <div className="ks-row">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {mayChange && filter !== 'noRecipe' ? (
        <button type="button" className="btn ks-add" onClick={() => setEditing('new')}>
          + {t('add')}
        </button>
      ) : null}
      {isOwner && data.on ? (
        <button type="button" className="ks-off-link" disabled={busy} onClick={() => void toggle(false)}>
          {t('switchOff')}
        </button>
      ) : null}

      {editing ? (
        <MaterialSheet
          material={editing === 'new' ? null : editing}
          branchId={branchId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
