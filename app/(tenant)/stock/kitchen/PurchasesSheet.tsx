'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '../../../shared/a11y/useDialog';
import { api, formatMoney } from '../../lib/api';
import type { PurchaseSummary } from '../../lib/api-types';
import { formatDate } from '../../lib/format';

/**
 * Jira GRW-738 — a branch's past stock ins, newest first: when, from whom, the bill number and what it came to before GST. Tapping one
 * opens it to correct or delete (the parent swaps this sheet for the stock-in sheet).
 */
export function PurchasesSheet({
  branchId,
  onClose,
  onOpen,
  onNew,
}: {
  branchId: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const t = useTranslations('kitchenStock.purchases');
  const tk = useTranslations('kitchenStock');
  const locale = useLocale();
  const [rows, setRows] = useState<PurchaseSummary[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, { onClose });

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const page = await api.purchases(branchId);
      setRows(page.purchases);
      setMore(page.more);
    } catch {
      setFailed(true);
    }
  }, [branchId]);
  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!rows) return;
    setLoadingMore(true);
    try {
      const page = await api.purchases(branchId, rows.length);
      setRows([...rows, ...page.purchases]);
      setMore(page.more);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="modal sheet prd-sheet ks-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <button type="button" className="sheet-head-cancel" onClick={onClose}>
            {tk('close')}
          </button>
          <span className="sheet-head-title">{t('title')}</span>
          <span className="prd-head-spacer" aria-hidden="true" />
        </div>
        <div className="sheet-body prd-form-body">
          {failed ? (
            <div role="alert" className="ks-state ks-state-error">
              <p>{t('loadFailed')}</p>
              <button type="button" className="btn btn-ghost" onClick={() => void load()}>
                {tk('retry')}
              </button>
            </div>
          ) : rows === null ? (
            <ul className="ks-list" aria-busy="true" aria-label={tk('loading')}>
              {[0, 1, 2].map((i) => (
                <li key={i} className="ks-row ks-skel" aria-hidden="true" />
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <div className="ks-state ks-empty">
              <strong>{t('empty')}</strong>
              <span>{t('emptyHint')}</span>
              <button type="button" className="btn" onClick={onNew}>
                {tk('actions.stockIn')}
              </button>
            </div>
          ) : (
            <>
              <ul className="ks-list">
                {rows.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="ks-row ks-row-btn" onClick={() => onOpen(p.id)}>
                      <span className="ks-name">
                        {p.supplierName ?? t('noSupplier')}
                        <span className="ks-meta">
                          {formatDate(`${p.boughtOn}T12:00:00Z`, 'UTC', locale)}
                          {p.billNo ? ` · ${p.billNo}` : ''} · {t('lines', { n: p.lineCount })}
                          {p.noPrice ? ` · ${t('noPrice')}` : ''}
                        </span>
                      </span>
                      {typeof p.totalMinor === 'number' ? <span className="ks-amount">{formatMoney(p.totalMinor, 'INR', locale)}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
              {more ? (
                <button type="button" className="btn btn-ghost ks-more" disabled={loadingMore} onClick={() => void loadMore()}>
                  {t('more')}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
