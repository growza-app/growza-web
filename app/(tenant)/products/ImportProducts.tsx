'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useDialog } from '../../shared/a11y/useDialog';
import type { Product, ProductCategory, ProductImportResult } from '../lib/api-types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAreas } from '../components/SessionProvider';
import { ImportProductDone } from './ImportProductDone';
import { ImportProductColumns } from './ImportProductColumns';
import { ImportProductReview } from './ImportProductReview';
import { buildDrafts, suggest, SAMPLE_CSV, SAMPLE_MENU_CSV, type ColumnMap, type ProductDraft } from './product-import';

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
  categories,
  branchId,
  onClose,
  onImported,
}: {
  /** The branch's whole shelf, retired products too — what a row of the file is matched against. */
  shelf: Product[];
  categories: ProductCategory[];
  branchId: string;
  onClose: () => void;
  onImported: (result: ProductImportResult) => void;
}) {
  const t = useTranslations('products.import');
  const counted = useAreas().stock;
  const [step, setStep] = useState<'pick' | 'map' | 'review' | 'done'>('pick');
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  // Off unless the owner turns it on: a file that carries the counts as they stand would otherwise be counted twice.
  const [addStock, setAddStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Closing mid-review would throw away every fix the owner has made, so it asks first. Once the file is in, or
  // before there is anything to lose, it just closes.
  const requestClose = () => (step === 'review' ? setLeaving(true) : onClose());
  // Escape closes, Tab stays inside, focus goes back to the button that opened it — except while a file is being read,
  // and while the "leave?" question is up, which answers Escape itself.
  useDialog(dialogRef, { onClose: busy || leaving ? undefined : requestClose });

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
    const csv = counted ? SAMPLE_CSV : SAMPLE_MENU_CSV;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = counted ? 'products-sample.csv' : 'menu-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const dialogTitle = t(counted ? 'title' : 'titleUncounted');
  const reviewHeading = t(counted ? 'reviewTitle' : 'reviewTitleUncounted', { count: drafts.length });

  return (
    <div className="modal-backdrop" onClick={busy || leaving ? undefined : requestClose}>
      <div className="modal import-modal" role="dialog" aria-modal="true" aria-label={dialogTitle} ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <h3>{step === 'map' ? t('mapTitle') : step === 'review' ? reviewHeading : step === 'done' ? t('doneTitle') : dialogTitle}</h3>

        {step === 'pick' && (
          <>
            <p className="confirm-body">{t('pickBody')}</p>
            <p className="confirm-body">{t(counted ? 'pickColumns' : 'pickColumnsUncounted')}</p>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0])} />
            <button type="button" className="btn btn-ghost import-change" disabled={busy} onClick={downloadSample}>
              {t('sample')}
            </button>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
                {t('cancel')}
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
          <ImportProductReview
            drafts={drafts}
            setDrafts={setDrafts}
            shelf={shelf}
            categories={categories.map((c) => c.name)}
            branchId={branchId}
            addStock={addStock}
            setAddStock={setAddStock}
            onBack={() => setStep('map')}
            onImported={(r) => {
              setResult(r);
              setStep('done');
              onImported(r);
            }}
          />
        )}

        {step === 'done' && result && map && <ImportProductDone result={result} drafts={drafts} addStock={addStock} headers={headers} map={map} onClose={onClose} />}

        {step !== 'review' && step !== 'done' && error && (
          <div role="alert" className="field-error" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>
      {leaving && (
        <ConfirmDialog
          title={t('leaveTitle')}
          body={t('leaveBody')}
          confirmLabel={t('leaveGo')}
          cancelLabel={t('leaveStay')}
          tone="danger"
          onConfirm={onClose}
          onCancel={() => setLeaving(false)}
        />
      )}
    </div>
  );
}
