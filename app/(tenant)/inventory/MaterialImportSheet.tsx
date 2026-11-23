'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { MaterialImportReview } from '../lib/api-types';
import { amount, unitWord } from '../lib/kitchen-units';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Jira GRW-737 — raw materials from a file, the way a menu comes in: pick a .xlsx or .csv, see what would be added (and what is already
 * there, or skipped and why), then add. Reading writes nothing; the same file twice adds nothing twice.
 */
export function MaterialImportSheet({ branchId, onClose, onDone }: { branchId: string; onClose: () => void; onDone: (added: number) => void }) {
  const t = useTranslations('kitchenStock.import');
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<MaterialImportReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialog(ref, { onClose: busy ? undefined : onClose });

  const read = async (file: File) => {
    setBusy(true);
    setError(null);
    setReview(null);
    try {
      setReview(await api.readMaterialFile(branchId, file));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!review) return;
    const items = review.rows.filter((r) => r.status === 'new').map(({ name, unit, category, lowStockAt, amount: a }) => ({ name, unit, category, lowStockAt, amount: a }));
    setBusy(true);
    setError(null);
    try {
      const out = await api.importMaterials(branchId, items);
      onDone(out.added);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div ref={ref} className="modal sheet prd-sheet ks-sheet" role="dialog" aria-modal="true" aria-label={t('title')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button type="button" className="sheet-head-cancel" disabled={busy} onClick={onClose}>
            {t('cancel')}
          </button>
          <span className="sheet-head-title">{t('title')}</span>
          <span className="prd-head-spacer" aria-hidden="true" />
        </div>
        <div className="sheet-body prd-form-body">
          <p className="ks-hint">{t('hint')}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void read(f);
            }}
          />
          <button type="button" className="btn btn-ghost ks-pick" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy && !review ? t('reading') : review ? t('pickAnother') : t('pick')}
          </button>
          {error ? (
            <div role="alert" className="sheet-foot sheet-foot-error">
              {error}
            </div>
          ) : null}
          {review ? (
            <>
              <p className="ks-import-sum" aria-live="polite">
                {t('summary', { adding: review.adding, already: review.already, skipped: review.skipped.length })}
              </p>
              <ul className="ks-list">
                {review.rows.map((r) => (
                  <li key={r.name} className="ks-row">
                    <span className="ks-name">
                      {r.name}
                      <span className="ks-meta">{r.status === 'exists' ? t('exists') : (r.category ?? t('new'))}</span>
                    </span>
                    <span className="ks-amount">{r.amount === null ? '—' : `${amount(r.amount)} ${unitWord(r.unit)}`}</span>
                  </li>
                ))}
              </ul>
              {review.skipped.length > 0 ? (
                <ul className="ks-skipped">
                  {review.skipped.map((s) => (
                    <li key={s.row}>{t('skippedRow', { row: s.row, name: s.name ?? '—', why: t(`why.${s.reason}`) })}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="prd-sheet-footer">
          {/* Jira GRW-744 — one Cancel, at the top: the foot is the one thing this sheet is for. */}
          <button type="button" className="btn prd-footer-save" disabled={busy || !review || review.adding === 0} onClick={() => void add()}>
            {busy && review ? t('adding') : t('add', { n: review?.adding ?? 0 })}
          </button>
        </div>
      </div>
    </div>
  );
}
