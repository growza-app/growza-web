'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLink from '../../shared/AppLink';
import { api, ApiError } from '../lib/api';
import type { KitchenStockList, StockMaterial } from '../lib/api-types';
import { amount, parseAmount, unitWord } from '../lib/kitchen-units';
import { useSession } from '../components/SessionProvider';
import { withBranch } from '../settings/branch-link';
import { MaterialSheet } from './MaterialSheet';
import { MaterialImportSheet } from './MaterialImportSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { WasteSheet } from './WasteSheet';
import { CountSheet } from './CountSheet';
import { StockInSheet } from './StockInSheet';
import { PurchasesSheet } from './PurchasesSheet';
import { BuyList } from './BuyList';

/** The sheets the actions open, one at a time. */
type Sheet = { kind: 'waste' } | { kind: 'count' } | { kind: 'stockIn'; id: string | null } | { kind: 'purchases' } | null;

/**
 * Jira GRW-744 — Stock shows every item, or what to buy. "To buy" is what the Buy tab was (GRW-739's list grouped by supplier, Share on
 * WhatsApp, past stock ins); it replaces the old Low filter, which listed the same items with less to say about them.
 */
export type StockFilter = 'all' | 'buy';

/**
 * Jira GRW-737 · GRW-738 · GRW-741 · GRW-744 — Inventory › Stock: what the kitchen cooks with, how much of each is left, and the three jobs
 * done on it, in one place.
 *
 * - One action bar: Stock in (the owner and a manager — the most frequent job, so the one filled button), Wasted and Count (them, and the
 *   kitchen: a role that works the Kitchen page and not the till). Before GRW-744 Stock in lived on another tab.
 * - All · To buy. Every row opens the item: its amount first, then its price and history; Edit is a button on that sheet.
 * - The quiet things at the foot: Add item, Import, Suppliers (no longer a tab), and the owner's switch.
 *
 * Jira GRW-743 — the opening count asks only about items nobody has stated an amount for (`known`): a stock in, a waste or a count already
 * did, and typing over it replaced the amount with nothing to say what moved. Below zero reads "None left" and says by how much.
 */
export function KitchenStockClient({ branchId, initialFilter = 'all' }: { branchId: string; initialFilter?: StockFilter }) {
  const t = useTranslations('kitchenStock');
  const session = useSession();
  const grid = session?.areas?.pages;
  const isOwner = session?.role === 'owner';
  const mayChange = isOwner || (grid ? grid.services === 'manage' : session?.role === 'manager');
  // The API's own line (kitchen-stock-buying.controller.ts): the menu's people, or a Kitchen holder who does not run the till.
  const mayWorkKitchen = mayChange || (grid ? grid.kitchen === 'manage' && grid.bookings !== 'manage' : false);

  const [data, setData] = useState<KitchenStockList | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<StockFilter>(initialFilter);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<StockMaterial | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<Record<string, string>>({});
  // The buy list re-reads after a stock in: what was bought may have taken an item off it.
  const [round, setRound] = useState(0);
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
    setRound((n) => n + 1);
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
  // GRW-743 FR-01 — only an item with no amount anybody stated. `known` is absent from an older API: then the old rule (never opened) stands.
  const unopened = materials.filter((m) => m.openedAt === null && m.known !== true && !skipped.includes(m.id));
  // A category says something only when the items do not all share it.
  const showCategory = new Set(materials.map((m) => m.category?.trim()).filter(Boolean)).size > 1;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? materials.filter((m) => m.name.toLowerCase().includes(q) || (m.category ?? '').toLowerCase().includes(q)) : materials;
  }, [materials, query]);

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
      // What was left empty counts as skipped: the card goes.
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

  const mayStockIn = mayChange && data.on && materials.length > 0;
  const mayRecord = mayWorkKitchen && materials.length > 0;

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

      {mayStockIn || mayRecord ? (
        <div className={`ks-actions ${mayStockIn && mayRecord ? 'ks-actions-3' : 'ks-actions-2'}`} role="group" aria-label={t('actions.label')}>
          {mayStockIn ? (
            <button type="button" className="btn ks-action ks-action-main" onClick={() => setSheet({ kind: 'stockIn', id: null })}>
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
              </svg>
              {t('actions.stockIn')}
            </button>
          ) : null}
          {mayRecord ? (
            <>
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
            </>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <p className="ks-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="sheet-foot sheet-foot-error ks-error">
          {error}
        </div>
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

      {materials.length > 0 ? (
        <div className="prd-chips ks-chips" role="group" aria-label={t('filtersLabel')}>
          {(
            [
              ['all', materials.length],
              ['buy', lowCount],
            ] as const
          ).map(([f, n]) => (
            <button
              key={f}
              type="button"
              className={`prd-chip ${filter === f ? 'prd-chip-on' : ''} ${f === 'buy' && n > 0 ? 'prd-chip-warn' : ''}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {t(`filter.${f === 'buy' ? 'toBuy' : 'all'}`)} <span className="prd-chip-n">{n}</span>
            </button>
          ))}
        </div>
      ) : null}

      {filter === 'buy' && materials.length > 0 ? (
        <>
          <BuyList key={round} branchId={branchId} />
          {mayChange ? (
            <button type="button" className="ks-quiet-link" onClick={() => setSheet({ kind: 'purchases' })}>
              {t('actions.pastStockIn')}
            </button>
          ) : null}
        </>
      ) : materials.length === 0 ? (
        <div className="ks-state ks-empty">
          <strong>{t('emptyTitle')}</strong>
          <span>{t('emptyHint')}</span>
        </div>
      ) : (
        <>
          <input className="prd-input ks-search" type="search" placeholder={t('search')} aria-label={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          {shown.length === 0 ? (
            <p className="ks-state">{t('noMatch')}</p>
          ) : (
            <ul className="ks-list">
              {shown.map((m) => {
                const tone = m.stock < 0 ? 'below' : m.low ? 'low' : '';
                return (
                  <li key={m.id}>
                    {/* Jira GRW-738 · GRW-744 — every row opens the item: its amount first, then (for the menu's people) Edit. */}
                    <button type="button" className="ks-row ks-row-btn" onClick={() => setEditing(m)}>
                      <span className="ks-name">
                        {m.name}
                        {showCategory && m.category ? <span className="ks-meta">{m.category}</span> : null}
                        {m.stock < 0 ? <span className="ks-meta ks-meta-warn">{t('overUsed', { amount: amount(-m.stock), unit: unitWord(m.unit) })}</span> : null}
                      </span>
                      <span className={`ks-amount ${tone ? `is-${tone}` : ''}`}>
                        {m.stock < 0 ? t('noneLeft') : `${amount(m.stock)} ${unitWord(m.unit)}`}
                        {tone === 'low' ? <span className="sr-only"> · {t('low')}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {mayChange || (isOwner && data.on) ? (
        <div className="ks-foot" role="group" aria-label={t('foot.label')}>
          {mayChange ? (
            <>
              <button type="button" className="ks-quiet-link" onClick={() => setEditing('new')}>
                + {t('add')}
              </button>
              <button type="button" className="ks-quiet-link" onClick={() => setImporting(true)}>
                {t('import.open')}
              </button>
              <AppLink className="ks-quiet-link" href={withBranch('/inventory/suppliers', branchId)}>
                {t('actions.suppliers')}
              </AppLink>
            </>
          ) : null}
          {isOwner && data.on ? (
            <button type="button" className="ks-quiet-link ks-off-link" disabled={busy} onClick={() => setConfirmOff(true)}>
              {t('switchOff')}
            </button>
          ) : null}
        </div>
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
    </div>
  );
}
