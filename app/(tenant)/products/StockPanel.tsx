'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { ManualMovementKind, Product, StockMovement } from '../lib/api-types';
import { intlLocale } from '../lib/format';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';
import { useSession } from '../components/SessionProvider';
import { stockTone } from './ProductsList';

/**
 * Owner, 2026-10-14 — the Stock part of the product sheet (0116).
 *
 * The count, large. Under it five reasons it changes — a delivery, one used by the business, one damaged, one a
 * client brought back, a recount — each a button that opens a two-field form (how many, a note). Below, the
 * ledger: every change, newest first, with who and when. The words are the same for every kind of business:
 * "Used in-house", never "used in the salon".
 */
export const MOVE_KINDS: readonly ManualMovementKind[] = ['received', 'used', 'damaged', 'returned', 'adjusted'];
export const ADD_KINDS: readonly ManualMovementKind[] = ['received', 'returned', 'adjusted'];
export const REMOVE_KINDS: readonly ManualMovementKind[] = ['used', 'damaged', 'adjusted'];
type ActionKind = ManualMovementKind | 'transfer';
type TileGroup = 'add' | 'remove' | 'move';

function IconPlusCircle() {
  return (
    <svg className="prd-tile-icon" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="13" fill="currentColor" />
      <path d="M14 8.5v11M8.5 14h11" stroke="var(--surface)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function IconMinusCircle() {
  return (
    <svg className="prd-tile-icon" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="13" fill="currentColor" />
      <path d="M8.5 14h11" stroke="var(--surface)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function IconTransferArrows() {
  return (
    <svg className="prd-tile-icon prd-tile-icon-arrows" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M8 10h12m0 0-3.5-3.5M20 10l-3.5 3.5M20 18H8m0 0 3.5-3.5M8 18l3.5 3.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StockPanel({ product, onChanged }: { product: Product; onChanged: (p: Product) => void }) {
  const t = useTranslations('products.ledger');
  const tc = useTranslations('common');
  const locale = useLocale();
  const session = useSession();
  const branches = session?.branches ?? [];
  const otherBranches = branches.filter((b) => b.id !== product.locationId);
  const hereName = branches.find((b) => b.id === product.locationId)?.name ?? null;
  const canTransfer =
    (session?.role === null || session?.role === undefined || session?.role === 'owner' || session?.role === 'manager') && otherBranches.length > 0;

  const [ledger, setLedger] = useState<StockMovement[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [group, setGroup] = useState<TileGroup | null>(null);
  const [kind, setKind] = useState<ActionKind | null>(null);
  const [toBranchId, setToBranchId] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .productMovements(product.id)
      .then((rows) => {
        setLoadFailed(false);
        setLedger(rows);
      })
      // Said, not shown as an empty history: "Nothing has happened" is a claim a failed load cannot make.
      .catch(() => setLoadFailed(true));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const activeGroup: TileGroup | null = kind === null ? null : group;
  const reasonOptions = activeGroup === 'add' ? ADD_KINDS : activeGroup === 'remove' ? REMOVE_KINDS : null;

  const n = Math.trunc(Number(qty));
  const shelfStock = Math.max(product.stock, 0);
  // A removal or branch transfer cannot exceed what is on this shelf. The server refuses it too; saying so here means
  // the button is off and the sentence is already on the screen.
  const tooMany = (kind === 'transfer' || kind === 'used' || kind === 'damaged') && Number.isFinite(n) && n > shelfStock;
  const canGo =
    kind !== null &&
    qty.trim() !== '' &&
    Number.isFinite(n) &&
    (kind === 'adjusted' ? n >= 0 : n > 0) &&
    (kind !== 'transfer' || toBranchId !== '') &&
    !tooMany;

  const go = async () => {
    if (!kind || !canGo || busy) return;
    setBusy(true);
    setError(null);
    try {
      let updated: Product;
      if (kind === 'transfer') {
        const res = await api.transferProduct(product.id, {
          toLocationId: toBranchId,
          qty: n,
          note: note.trim() || undefined,
        });
        updated = res.from;
      } else {
        // A recount sends the COUNT: the server sets it under a lock, so a sale since this sheet opened is not undone.
        const body = kind === 'adjusted' ? { kind, count: n, note: note.trim() || undefined } : { kind, qty: n, note: note.trim() || undefined };
        updated = await api.moveStock(product.id, body);
      }
      onChanged(updated);
      setGroup(null);
      setKind(null);
      setQty('');
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const tone = stockTone(product);
  const when = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  const afterCount =
    kind === 'adjusted' ? n : kind === 'received' || kind === 'returned' ? shelfStock + n : Math.max(0, shelfStock - n);
  return (
    <div className="sheet-body prd-stock">
      <div className={`prd-count prd-count-${tone}`}>
        <span className="prd-count-n">{shelfStock}</span>
        <span className="prd-count-l">{tone === 'out' ? t('outNow') : tone === 'low' ? t('lowNow', { at: product.lowStockAt }) : t('onShelf')}</span>
      </div>

      <div className={`prd-moves ${canTransfer ? 'prd-moves-3' : 'prd-moves-2'}`} role="group" aria-label={t('change')}>
        <button
          type="button"
          className={`prd-move prd-move-tile prd-move-add ${activeGroup === 'add' ? 'is-on' : ''}`}
          aria-pressed={activeGroup === 'add'}
          disabled={busy}
          onClick={() => {
            const closing = activeGroup === 'add';
            setGroup(closing ? null : 'add');
            setKind(closing ? null : 'received');
            setQty('');
            setError(null);
          }}
        >
          <IconPlusCircle />
          <span className="prd-tile-label">{t('actions.add')}</span>
        </button>

        <button
          type="button"
          className={`prd-move prd-move-tile prd-move-remove ${activeGroup === 'remove' ? 'is-on' : ''}`}
          aria-pressed={activeGroup === 'remove'}
          disabled={busy}
          onClick={() => {
            const closing = activeGroup === 'remove';
            setGroup(closing ? null : 'remove');
            setKind(closing ? null : 'used');
            setQty('');
            setError(null);
          }}
        >
          <IconMinusCircle />
          <span className="prd-tile-label">{t('actions.remove')}</span>
        </button>

        {canTransfer ? (
          <button
            type="button"
            className={`prd-move prd-move-tile prd-move-transfer ${activeGroup === 'move' ? 'is-on' : ''}`}
            aria-pressed={activeGroup === 'move'}
            disabled={busy}
            onClick={() => {
              const closing = activeGroup === 'move';
              setGroup(closing ? null : 'move');
              setKind(closing ? null : 'transfer');
              if (!closing) {
                setToBranchId((prev) => (otherBranches.some((b) => b.id === prev) ? prev : (otherBranches[0]?.id ?? '')));
              }
              setQty('');
              setError(null);
            }}
          >
            <IconTransferArrows />
            <span className="prd-tile-label">{t('actions.move')}</span>
          </button>
        ) : null}
      </div>

      {kind ? (
        <div className="sheet-group prd-move-form">
          {reasonOptions ? (
            <div className="sheet-row prd-reason-row">
              <span className="sheet-row-label">{t('reason')}</span>
              <div className="prd-reasons" role="group" aria-label={t('reason')}>
                {reasonOptions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`prd-reason-chip ${kind === r ? 'is-on' : ''}`}
                    aria-pressed={kind === r}
                    disabled={busy}
                    onClick={() => {
                      if (r === kind) return;
                      if (r === 'adjusted') setQty(String(shelfStock));
                      else if (kind === 'adjusted') setQty('');
                      setKind(r);
                      setError(null);
                    }}
                  >
                    {t(`kind.${r}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {kind === 'transfer' ? (
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor="prd-move-branch">
                {t('transfer.toBranch')}
              </label>
              <div className="sheet-row-value">
                <select
                  id="prd-move-branch"
                  value={toBranchId}
                  onChange={(e) => {
                    setToBranchId(e.target.value);
                    setError(null);
                  }}
                >
                  {otherBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          <div className="sheet-row">
            <label className="sheet-row-label" htmlFor="prd-move-qty">
              {kind === 'adjusted' ? t('countIs') : t('howMany')}
            </label>
            <div className="sheet-row-value">
              <input
                id="prd-move-qty"
                type="number"
                inputMode="numeric"
                min={kind === 'adjusted' ? 0 : 1}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                autoFocus={autoFocusField(true)}
              />
            </div>
          </div>
          <div className="sheet-row">
            <label className="sheet-row-label" htmlFor="prd-move-note">
              {t('note')}
            </label>
            <div className="sheet-row-value">
              <input id="prd-move-note" type="text" maxLength={200} value={note} placeholder={t(`noteHint.${kind}`)} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <div className="prd-move-go">
            <span className={`prd-move-after ${tooMany ? 'prd-move-after-warn' : ''}`} role={tooMany ? 'alert' : undefined}>
              {tooMany ? t('transfer.tooMany', { n: Math.max(product.stock, 0) }) : canGo ? t('after', { n: afterCount }) : ''}
            </span>
            <button type="button" className="btn" disabled={!canGo || busy} onClick={() => void go()}>
              {busy ? tc('working') : t('confirm')}
            </button>
          </div>
          {error ? (
            <div role="alert" className="sheet-foot sheet-foot-error">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}

      <h3 className="prd-ledger-h">{t('history')}</h3>
      {loadFailed ? (
        <div role="alert" className="sheet-foot sheet-foot-error">
          {t('loadFailed')}
        </div>
      ) : ledger === null ? (
        <div className="sheet-foot">{tc('loading')}</div>
      ) : ledger.length === 0 ? (
        <div className="sheet-foot">{t('noHistory')}</div>
      ) : (
        <ul className="prd-ledger">
          {ledger.map((m) => (
            <li key={m.id} className="prd-ledger-row">
              <span className={`prd-ledger-qty ${m.qty > 0 ? 'prd-ledger-in' : 'prd-ledger-out'}`}>
                {m.qty > 0 ? '+' : '−'}
                {Math.abs(m.qty)}
              </span>
              <span className="prd-ledger-what">
                <span className="prd-ledger-kind">{t(`kind.${m.kind}`)}</span>
                {m.note ? <span className="prd-ledger-note">{m.note}</span> : null}
              </span>
              <span className="prd-ledger-when">
                {when.format(new Date(m.createdAt))}
                {m.byName ? ` · ${m.byName}` : ''}
              </span>
              <span className="prd-ledger-after">{t('afterShort', { n: m.stockAfter })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
