'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { KitchenStockList, StockMaterial } from '../../lib/api-types';
import { amount, parseAmount, unitWord } from '../../lib/kitchen-units';
import { useSession } from '../../components/SessionProvider';
import { MaterialSheet } from './MaterialSheet';
import { MaterialImportSheet } from './MaterialImportSheet';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StockInSheet } from './StockInSheet';
import { PurchasesSheet } from './PurchasesSheet';
import { SuppliersSheet } from './SuppliersSheet';
import { WasteSheet } from './WasteSheet';
import { CountSheet } from './CountSheet';
import { BuyList } from './BuyList';

/** Jira GRW-738 — the sheets the actions open, one at a time. */
type Sheet = { kind: 'stockIn'; id: string | null } | { kind: 'purchases' } | { kind: 'suppliers' } | { kind: 'waste' } | { kind: 'count' } | null;

/** Jira GRW-739 — `toBuy`: what to buy (items at or below a low-stock level they were given), grouped by supplier, to share. */
type Filter = 'low' | 'toBuy' | 'all' | 'noRecipe';

/**
 * Jira GRW-737 — the kitchen's raw materials at one branch: low ones first, below zero in red (BR-01: a count may go under, the kitchen
 * never stops), a dish with no recipe listed so the owner knows what is not tracked. The owner switches tracking on and types today's amounts
 * once; the owner and a manager add and change items; the counter and the cook read.
 *
 * Jira GRW-738 — and the three things that keep it true: Stock in (the owner and a manager), Wasted and Count (them, and the kitchen — a
 * role that works the Kitchen page and not the till, the same line `cooksOnly` draws). Finishing a count is the owner's and a manager's.
 * Suppliers and past stock ins are a tap away for whoever records stock in. Every row opens its history.
 */
export function KitchenStockClient({ branchId, show }: { branchId: string; show?: string }) {
  const t = useTranslations('kitchenStock');
  const session = useSession();
  const grid = session?.areas?.pages;
  const isOwner = session?.role === 'owner';
  const mayChange = isOwner || (grid ? grid.services === 'manage' : session?.role === 'manager');
  // The API's own line (kitchen-stock-buying.controller.ts): the menu's people, or a Kitchen holder who does not run the till.
  const mayWorkKitchen = mayChange || (grid ? grid.kitchen === 'manage' && grid.bookings !== 'manage' : false);

  const [data, setData] = useState<KitchenStockList | null>(null);
  const [failed, setFailed] = useState(false);
  // Jira GRW-739 — Reports › Food cost links to `?show=no-recipe` (fix the dishes with no recipe); `?show=to-buy` opens What to buy.
  const [filter, setFilter] = useState<Filter>(show === 'no-recipe' ? 'noRecipe' : show === 'to-buy' ? 'toBuy' : 'all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<StockMaterial | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<Record<string, string>>({});
  // QA 2026-11-18 — Skip is remembered on this device, per branch and per item, so the card does not ask again for what was skipped.
  const skipKey = `ks-opening-skipped:${branchId}`;
  const [skipped, setSkipped] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(skipKey) ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const skipOpening = (ids: string[]) => {
    const next = [...new Set([...skipped, ...ids])];
    setSkipped(next);
    try {
      window.localStorage.setItem(skipKey, JSON.stringify(next));
    } catch {
      // Private window or blocked storage: skipped for this visit only.
    }
  };
  const [confirmOff, setConfirmOff] = useState(false);
  const [sheet, setSheetNow] = useState<Sheet>(null);
  // A new sheet clears the last one's "saved" line, so what the page says is always about the latest thing done.
  const setSheet = (next: Sheet) => {
    if (next) setNotice(null);
    setSheetNow(next);
  };
  const done = (text: string) => {
    setSheet(null);
    setNotice(text);
    void load();
  };

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
  // The API's own rule (FR-01): at or below a level that was set; an item with no level is never on the list, even below zero.
  const toBuyCount = materials.filter((m) => m.lowStockAt > 0 && m.stock <= m.lowStockAt).length;
  const unopened = materials.filter((m) => m.openedAt === null && !skipped.includes(m.id));
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
      skipOpening(unopened.map((m) => m.id));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.openingStock(entries);
      // What was left empty counts as skipped: the card goes, and those items still read "Not counted yet".
      skipOpening(unopened.filter((m) => !entries.some((e) => e.materialId === m.id)).map((m) => m.id));
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

      {data.on && mayChange && unopened.length > 0 ? (
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
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => skipOpening(unopened.map((m) => m.id))}>
              {t('openingSkip')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void saveOpening()}>
              {busy ? t('saving') : t('openingSave')}
            </button>
          </div>
        </section>
      ) : null}

      {mayWorkKitchen && materials.length > 0 ? (
        <div className={`ks-actions ${mayChange ? '' : 'ks-actions-2'}`} role="group" aria-label={t('actions.label')}>
          {mayChange ? (
            <button type="button" className="btn ks-action" onClick={() => setSheet({ kind: 'stockIn', id: null })}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
              </svg>
              {t('actions.stockIn')}
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost ks-action" onClick={() => setSheet({ kind: 'waste' })}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
            </svg>
            {t('actions.wasted')}
          </button>
          <button type="button" className="btn btn-ghost ks-action" onClick={() => setSheet({ kind: 'count' })}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5h10M9 12h10M9 19h10M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2" />
            </svg>
            {t('actions.count')}
          </button>
        </div>
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
            ['toBuy', toBuyCount],
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

      {filter === 'toBuy' ? (
        <BuyList branchId={branchId} />
      ) : filter === 'noRecipe' ? (
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
          {mayChange ? (
            <button type="button" className="btn btn-ghost" onClick={() => setImporting(true)}>
              {t('import.open')}
            </button>
          ) : null}
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
            // Jira GRW-738 — every row opens: to change it (the menu's people) or to read its history (everyone else).
            return (
              <li key={m.id}>
                <button type="button" className="ks-row ks-row-btn" onClick={() => setEditing(m)}>
                  {row}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {notice ? (
        <p className="ks-notice" role="status">
          {notice}
        </p>
      ) : null}
      {mayChange && filter !== 'noRecipe' && filter !== 'toBuy' ? (
        <div className="ks-pair">
          <button type="button" className="btn btn-ghost" onClick={() => setImporting(true)}>
            {t('import.open')}
          </button>
          <button type="button" className="btn ks-add" onClick={() => setEditing('new')}>
            + {t('add')}
          </button>
        </div>
      ) : null}
      {mayChange && filter !== 'noRecipe' && filter !== 'toBuy' ? (
        <div className="ks-pair">
          <button type="button" className="btn btn-ghost" onClick={() => setSheet({ kind: 'suppliers' })}>
            {t('actions.suppliers')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setSheet({ kind: 'purchases' })}>
            {t('actions.pastStockIn')}
          </button>
        </div>
      ) : null}
      {isOwner && data.on ? (
        <button type="button" className="ks-off-link" disabled={busy} onClick={() => setConfirmOff(true)}>
          {t('switchOff')}
        </button>
      ) : null}

      {confirmOff ? (
        // QA 2026-11-18 — one tap stopped tracking for every till; it now asks first and says what stops.
        <ConfirmDialog
          tone="danger"
          title={t('offTitle')}
          body={t('offBody')}
          confirmLabel={t('offConfirm')}
          cancelLabel={t('offKeep')}
          busy={busy}
          onConfirm={() => {
            setConfirmOff(false);
            void toggle(false);
          }}
          onCancel={() => setConfirmOff(false)}
        />
      ) : null}
      {importing ? (
        <MaterialImportSheet
          branchId={branchId}
          onClose={() => setImporting(false)}
          onDone={(added) => {
            setImporting(false);
            setNotice(t('import.done', { n: added }));
            void load();
          }}
        />
      ) : null}
      {editing ? (
        <MaterialSheet
          material={editing === 'new' ? null : editing}
          branchId={branchId}
          readOnly={!mayChange}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}
      {sheet?.kind === 'stockIn' ? (
        <StockInSheet branchId={branchId} materials={materials} purchaseId={sheet.id} onClose={() => setSheet(null)} onDone={done} />
      ) : null}
      {sheet?.kind === 'purchases' ? (
        <PurchasesSheet
          branchId={branchId}
          onClose={() => setSheet(null)}
          onOpen={(id) => setSheet({ kind: 'stockIn', id })}
          onNew={() => setSheet({ kind: 'stockIn', id: null })}
        />
      ) : null}
      {sheet?.kind === 'suppliers' ? <SuppliersSheet branchId={branchId} onClose={() => setSheet(null)} /> : null}
      {sheet?.kind === 'waste' ? <WasteSheet materials={materials} onClose={() => setSheet(null)} onSaved={done} /> : null}
      {sheet?.kind === 'count' ? (
        <CountSheet
          branchId={branchId}
          mayFinish={mayChange}
          onClose={() => {
            setSheet(null);
            void load();
          }}
          onFinished={done}
        />
      ) : null}
    </div>
  );
}
