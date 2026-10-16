'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { MovementKind, Product, StockMovement } from '../lib/api-types';
import { intlLocale } from '../lib/format';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';
import { stockTone } from './ProductsList';

/**
 * Owner, 2026-10-14 — the Stock part of the product sheet (0116).
 *
 * The count, large. Under it five reasons it changes — a delivery, one used by the business, one damaged, one a
 * client brought back, a recount — each a button that opens a two-field form (how many, a note). Below, the
 * ledger: every change, newest first, with who and when. The words are the same for every kind of business:
 * "Used in-house", never "used in the salon".
 */
export const MOVE_KINDS: readonly Exclude<MovementKind, 'sold'>[] = ['received', 'used', 'damaged', 'returned', 'adjusted'];

export function StockPanel({ product, onChanged }: { product: Product; onChanged: (p: Product) => void }) {
  const t = useTranslations('products.ledger');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [ledger, setLedger] = useState<StockMovement[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [kind, setKind] = useState<Exclude<MovementKind, 'sold'> | null>(null);
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

  const n = Math.trunc(Number(qty));
  const canGo = kind !== null && qty.trim() !== '' && Number.isFinite(n) && (kind === 'adjusted' ? n >= 0 : n > 0);

  const go = async () => {
    if (!kind || !canGo || busy) return;
    setBusy(true);
    setError(null);
    try {
      // A recount sends the COUNT: the server sets it under a lock, so a sale since this sheet opened is not undone.
      const body = kind === 'adjusted' ? { kind, count: n, note: note.trim() || undefined } : { kind, qty: n, note: note.trim() || undefined };
      const updated = await api.moveStock(product.id, body);
      onChanged(updated);
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

  return (
    <div className="sheet-body prd-stock">
      <div className={`prd-count prd-count-${tone}`}>
        <span className="prd-count-n">{product.stock}</span>
        <span className="prd-count-l">{tone === 'out' ? t('outNow') : tone === 'low' ? t('lowNow', { at: product.lowStockAt }) : t('onShelf')}</span>
      </div>

      <div className="prd-moves" role="group" aria-label={t('change')}>
        {MOVE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`prd-move prd-move-${k} ${kind === k ? 'is-on' : ''}`}
            aria-pressed={kind === k}
            disabled={busy}
            onClick={() => {
              setKind(kind === k ? null : k);
              setQty(k === 'adjusted' ? String(product.stock) : '');
              setError(null);
            }}
          >
            {t(`kind.${k}`)}
          </button>
        ))}
      </div>

      {kind ? (
        <div className="sheet-group prd-move-form">
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
            <span className="prd-move-after">
              {canGo
                ? t('after', {
                    n: kind === 'adjusted' ? n : kind === 'received' || kind === 'returned' ? product.stock + n : product.stock - n,
                  })
                : ''}
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
