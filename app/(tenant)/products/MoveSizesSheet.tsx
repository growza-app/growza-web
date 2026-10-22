'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Product, Size } from '../lib/api-types';
import { useDialog } from '../../shared/a11y/useDialog';
import { IconMinus, IconPlus } from '../components/icons';
import { useSession } from '../components/SessionProvider';
import { sizeLabel } from '../lib/till-sizes';
import { clampQty, leftAfter, linesToSend, movableSizes, nothingToMove, totalMoving } from './move-sizes';

/**
 * Jira GRW-601 — move sizes of a product to another branch, in one bottom sheet.
 *
 * Decided with the owner (2026-10-20): a sheet from the product, not a page. Pick the branch, then a row per size with
 * − and + and the count that stays here beside it, and a Send bar at the bottom. The numbers are kept if the send
 * fails; the sizes come from one read when the sheet opens. A size at zero is shown and cannot be sent.
 */
export function MoveSizesSheet({ product, onMoved, onClose }: { product: Product; onMoved: (p: Product, sent: number, branch: string) => void; onClose: () => void }) {
  const t = useTranslations('products.moveSizes');
  const tc = useTranslations('common');
  const session = useSession();
  const others = (session?.branches ?? []).filter((b) => b.id !== product.locationId);
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose, initialFocus: 'container' });

  const [sizes, setSizes] = useState<Size[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [toId, setToId] = useState(others.length === 1 ? others[0]!.id : '');
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoadFailed(false);
    return api
      .productSizes(product.id)
      .then((r) => setSizes(r.variants))
      .catch(() => setLoadFailed(true));
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const rows = sizes ? movableSizes(sizes) : [];
  const lines = sizes ? linesToSend(sizes, qtys) : [];
  const total = totalMoving(lines);
  const toName = others.find((b) => b.id === toId)?.name ?? '';
  const canSend = !busy && toId !== '' && total > 0;

  const step = (s: Size, by: number) => setQtys((q) => ({ ...q, [s.id]: clampQty(s, (q[s.id] ?? 0) + by) }));

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.transferSizes(product.id, { toLocationId: toId, sizes: lines });
      onMoved(res.from, total, toName);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
      // A refusal because a count moved under us: show the counts as they are now, keep the owner's numbers.
      if (err instanceof ApiError && err.status === 409) void load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pf-keypad-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="pf-keypad pmv-sheet" role="dialog" aria-modal="true" aria-label={`${t('title')}: ${product.name}`} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{t('title')}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose}>
            {t('close')}
          </button>
        </div>
        <p className="pmv-name">{product.name}</p>

        <label className="pmv-branch">
          <span>{t('toBranch')}</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)} disabled={busy}>
            {others.length !== 1 ? <option value="">{t('chooseBranch')}</option> : null}
            {others.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        {loadFailed ? (
          <div className="pmv-note" role="alert">
            <span>{t('loadFailed')}</span>
            <button type="button" className="btn" onClick={() => void load()}>
              {t('retry')}
            </button>
          </div>
        ) : sizes === null ? (
          <ul className="pmv-rows" aria-busy="true" aria-label={t('loading')}>
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="pmv-row pmv-skel hm-skeleton" />
            ))}
          </ul>
        ) : nothingToMove(sizes) ? (
          <div className="pmv-note">
            <strong>{t('nothing')}</strong>
            <span>{t('nothingWhy')}</span>
          </div>
        ) : (
          <ul className="pmv-rows">
            {rows.map((s) => {
              const n = clampQty(s, qtys[s.id] ?? 0);
              const out = s.stock <= 0;
              const name = `${product.name} ${sizeLabel(s)}`;
              return (
                <li key={s.id} className={`pmv-row ${out ? 'is-out' : ''} ${n > 0 ? 'is-on' : ''}`}>
                  <span className="pmv-size">
                    <span className="pmv-label">{sizeLabel(s)}</span>
                    <span className="pmv-count">{out ? t('none') : n > 0 ? t('leftAfter', { n: leftAfter(s, n) }) : t('here', { n: s.stock })}</span>
                  </span>
                  <span className="pmv-step" role="group" aria-label={name}>
                    <button type="button" className="pf-qty-btn" aria-label={t('less', { name })} disabled={out || n === 0 || busy} onClick={() => step(s, -1)}>
                      <IconMinus />
                    </button>
                    <span className="pf-qty-n" aria-live="polite">
                      {n}
                    </span>
                    <button type="button" className="pf-qty-btn" aria-label={t('more', { name })} disabled={out || n >= s.stock || busy} onClick={() => step(s, 1)}>
                      <IconPlus />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="pmv-bar">
          {error ? (
            <p className="pmv-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="button" className="btn btn-primary pmv-send" disabled={!canSend} onClick={() => void send()}>
            {busy ? t('sending') : total > 0 && toName ? t('send', { n: total, branch: toName }) : t('sendIdle')}
          </button>
        </div>
      </div>
    </div>
  );
}
