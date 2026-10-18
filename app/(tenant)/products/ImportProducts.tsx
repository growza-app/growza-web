'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useDialog } from '../../shared/a11y/useDialog';
import type { Product, ProductImportResult } from '../lib/api-types';
import { ImportProductColumns } from './ImportProductColumns';
import { ImportProductReview } from './ImportProductReview';
import { buildDrafts, suggest, SAMPLE_CSV, type ColumnMap, type ProductDraft } from './product-import';

/**
 * Owner, 2026-10-18 — load the shelf from a spreadsheet: pick the file, confirm which column is which, check every
 * row before anything is written.
 *
 * The same three steps as the price-list import, because it is the same job. The write is one transaction — a file
 * either lands whole or not at all — and a row that matches a product already on the shelf corrects it rather than
 * making a second copy.
 */
export function ImportProducts({
  shelf,
  branchId,
  onClose,
  onImported,
}: {
  /** The branch's whole shelf, retired products too — what a row of the file is matched against. */
  shelf: Product[];
  branchId: string;
  onClose: () => void;
  onImported: (result: ProductImportResult) => void;
}) {
  const t = useTranslations('products.import');
  const [step, setStep] = useState<'pick' | 'map' | 'review'>('pick');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Escape closes, Tab stays inside, focus goes back to the button that opened it — except while a file is being read.
  useDialog(dialogRef, { onClose: busy ? undefined : onClose });

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const sheet = await api.parseProductSheet(file);
      setHeaders(sheet.headers);
      setRows(sheet.rows);
      setMap(suggest(sheet.headers));
      setStep('map');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : t('readFailed'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /** A starter file, made here: nothing is fetched, and the owner can fill it in or see what the importer recognises. */
  const downloadSample = () => {
    const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal import-modal" role="dialog" aria-modal="true" aria-label={t('title')} ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <h3>{step === 'map' ? t('mapTitle') : step === 'review' ? t('reviewTitle', { count: drafts.length }) : t('title')}</h3>

        {step === 'pick' && (
          <>
            <p className="confirm-body">{t('pickBody')}</p>
            <p className="confirm-body">{t('pickColumns')}</p>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={downloadSample}>
                {t('sample')}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? t('reading') : t('chooseFile')}
              </button>
            </div>
          </>
        )}

        {step === 'map' && map && (
          <ImportProductColumns
            headers={headers}
            rows={rows}
            map={map}
            onMap={setMap}
            onBack={() => setStep('pick')}
            onNext={() => {
              setDrafts(buildDrafts(rows, map, shelf));
              setStep('review');
            }}
          />
        )}

        {step === 'review' && (
          <ImportProductReview drafts={drafts} setDrafts={setDrafts} shelf={shelf} branchId={branchId} onBack={() => setStep('map')} onImported={onImported} />
        )}

        {step !== 'review' && error && (
          <div role="alert" className="field-error" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
        {step === 'pick' && (
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
              {t('cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
