'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { api, ApiError, formatMoney } from '../lib/api';
import type { MenuImportResult, MenuReview } from '../lib/api-types';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Jira GRW-715 — a kitchen brings its whole menu in from a file: the one Petpooja gives it, or Growza's own sample filled in.
 *
 * Three taps on the common path: choose the file, look at the counts, Add. Nothing is saved until Add (BR-01) — reading the file
 * only tells the owner what would happen. A dish already on the menu is shown as such and left exactly as it is (BR-02); the
 * same file twice adds nothing twice (BR-03). The branch it lands in is said before Add, never assumed silently.
 */

/** Growza's own menu file, made here so nothing is fetched. The columns are the ones the reader looks for. */
export const SAMPLE_MENU_FILE = [
  'Category,Dish,Size,Price,GST %,HSN,Extras group,Extras',
  'Starters,Paneer Tikka,,240,5,,,',
  'Main Course,Butter Chicken,Half,180,5,,Extras,Butter 20; Extra gravy 30',
  'Main Course,Butter Chicken,Full,320,5,,,',
  'Breads,Garlic Naan,,60,5,,,',
  'Beverages,Masala Chaas,,60,5,,,',
].join('\n') + '\n';

export function ImportMenu({
  branchId,
  branchName,
  onClose,
  onImported,
  onPricesFromFile,
}: {
  branchId: string;
  /** Shown before Add: the dishes belong to this branch only (a dish is one branch's). */
  branchName: string | null;
  onClose: () => void;
  onImported: (result: MenuImportResult) => void;
  /** The column-by-column import, for changing prices of dishes already on the menu — this one never changes them. */
  onPricesFromFile: () => void;
}) {
  const t = useTranslations('products.menuImport');
  const [step, setStep] = useState<'pick' | 'review' | 'done'>('pick');
  const [review, setReview] = useState<MenuReview | null>(null);
  const [result, setResult] = useState<MenuImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose: busy ? undefined : onClose });

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setReview(await api.parseMenuFile(branchId, file));
      setStep('review');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : t('readFailed'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const fresh = review?.dishes.filter((d) => !d.onMenu) ?? [];
  const already = (review?.dishes.length ?? 0) - fresh.length;

  const add = async () => {
    if (!review || fresh.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Only what is new is sent: a dish already on the menu is not touched, whatever the file says about it.
      const done = await api.importMenu(branchId, fresh.map(({ onMenu: _onMenu, ...d }) => d));
      setResult(done);
      setStep('done');
      onImported(done);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : t('addFailed'));
    } finally {
      setBusy(false);
    }
  };

  const downloadSample = () => {
    const url = URL.createObjectURL(new Blob([SAMPLE_MENU_FILE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu-sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const title = step === 'review' ? t('reviewTitle') : step === 'done' ? t('doneTitle') : t('title');
  const money = (minor: number) => formatMoney(minor, 'INR');

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className={`modal import-modal${step === 'review' ? ' modal-fit' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>

        {step === 'pick' && (
          <>
            <p className="confirm-body">{t('pickBody')}</p>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" aria-label={t('chooseFile')} style={{ display: 'none' }} onChange={(e) => void pick(e.target.files?.[0])} />
            <div className="mi-links">
              <button type="button" className="btn btn-ghost import-change" disabled={busy} onClick={downloadSample}>
                {t('sample')}
              </button>
              <button type="button" className="btn btn-ghost import-change" disabled={busy} onClick={onPricesFromFile}>
                {t('pricesFromFile')}
              </button>
            </div>
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

        {step === 'review' && review && (
          <>
            <div className="modal-body">
              <p className="mi-counts" role="status">
                <strong>{t('willAdd', { n: fresh.length })}</strong>
                {already > 0 ? <span>{t('alreadyCount', { n: already })}</span> : null}
                {review.skipped.length > 0 ? <span>{t('skippedCount', { n: review.skipped.length })}</span> : null}
              </p>
              {branchName ? <p className="mi-branch">{t('branch', { branch: branchName })}</p> : null}
              {review.newCategories.length > 0 ? <p className="mi-note">{t('newCategories', { list: review.newCategories.join(', ') })}</p> : null}
              {review.newExtrasGroups.length > 0 ? <p className="mi-note">{t('newExtras', { list: review.newExtrasGroups.join(', ') })}</p> : null}
              {review.sizesDropped ? <p className="mi-note">{t('sizesDropped')}</p> : null}
              {review.extrasDropped ? <p className="mi-note">{t('extrasDropped')}</p> : null}

              {review.skipped.length > 0 ? (
                <section className="mi-section" aria-labelledby="mi-skipped">
                  <h4 id="mi-skipped">{t('skippedTitle')}</h4>
                  <ul className="mi-list">
                    {review.skipped.map((s) => (
                      <li key={`s${s.row}`} className="mi-row">
                        <span className="mi-name">{s.name ?? t('noName')}</span>
                        <span className="mi-meta">
                          {t('row', { row: s.row })} · {t(`reason.${s.reason}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {review.dishes.length > 0 ? (
                <section className="mi-section" aria-labelledby="mi-dishes">
                  <h4 id="mi-dishes">{t('dishesTitle')}</h4>
                  <ul className="mi-list">
                    {review.dishes.map((d) => (
                      <li key={`d${d.row}`} className={`mi-row${d.onMenu ? ' is-on-menu' : ''}`}>
                        <span className="mi-name">{d.name}</span>
                        <span className="mi-price">{d.sizes.length > 0 ? d.sizes.map((s) => `${s.label} ${money(s.priceMinor)}`).join(' · ') : money(d.priceMinor)}</span>
                        <span className="mi-meta">
                          {[d.category, d.extras.length > 0 ? t('extrasLine', { list: d.extras.map((g) => g.name).join(', ') }) : null].filter(Boolean).join(' · ')}
                        </span>
                        {d.onMenu ? <span className="chip mi-flag">{t('onMenu')}</span> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <p className="mi-note">{t('nothingReadable')}</p>
              )}
            </div>
            {error ? (
              <div role="alert" className="field-error">
                {error}
              </div>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setStep('pick')}>
                {t('back')}
              </button>
              <button type="button" className="btn" disabled={busy || fresh.length === 0} onClick={() => void add()}>
                {busy ? t('adding') : fresh.length === 0 ? t('nothingNew') : t('add', { n: fresh.length })}
              </button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <>
            <p className="confirm-body" role="status">
              {t('doneBody', { created: result.created, already: result.alreadyOnMenu })}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>
                {t('close')}
              </button>
            </div>
          </>
        )}

        {step === 'pick' && error ? (
          <div role="alert" className="field-error" style={{ marginTop: 'var(--sp-3)' }}>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
