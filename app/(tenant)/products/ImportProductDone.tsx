'use client';

import { useTranslations } from 'next-intl';
import type { ProductImportResult } from '../lib/api-types';
import { mappingSummary, notImported, stockNotApplied, type ColumnMap, type ProductDraft } from './product-import';

/** Rows listed by name before the rest are counted; a thousand-row file with a wrong column could skip all of them. */
const LISTED = 50;

/**
 * Owner, 2026-10-18 — what the import did, and what it read, once it has done it.
 *
 * Three things the owner needs and the product screen cannot give them afterwards: which rows were NOT imported and
 * why (a negative number, a repeat, one they skipped), what appeared on their shelf that they did not type (new
 * categories), and how each column of their file was read — so a column taken for the wrong thing is found now,
 * while the file is still open, not when a price looks odd a week later.
 */
export function ImportProductDone({
  result,
  drafts,
  headers,
  map,
  onClose,
}: {
  result: ProductImportResult;
  drafts: ProductDraft[];
  headers: string[];
  map: ColumnMap;
  onClose: () => void;
}) {
  const t = useTranslations('products.import');
  const skipped = notImported(drafts);
  const stockUnused = stockNotApplied(drafts);
  const { used, unused } = mappingSummary(headers, map);
  const column = (name: string, i: number) => name || t('column', { n: i + 1 });

  return (
    <>
      <ul className="import-matched" aria-label={t('doneTitle')}>
        {result.created > 0 && (
          <li>
            <span className="import-matched-col">{t('doneAdded', { count: result.created })}</span>
          </li>
        )}
        {result.updated > 0 && (
          <li>
            <span className="import-matched-col">{t('doneUpdated', { count: result.updated })}</span>
          </li>
        )}
        {result.created === 0 && result.updated === 0 && (
          <li>
            <span className="import-matched-col">{t('doneNothing')}</span>
          </li>
        )}
      </ul>
      {result.categoryNames.length > 0 && <p className="confirm-body">{t('doneCategories', { names: result.categoryNames.join(', ') })}</p>}
      {stockUnused > 0 && <p className="confirm-body">{t('stockNotApplied', { count: stockUnused })}</p>}

      {skipped.length > 0 && (
        <section aria-label={t('notImportedTitle', { count: skipped.length })}>
          <h4 className="field-label">{t('notImportedTitle', { count: skipped.length })}</h4>
          <ul className="import-matched">
            {skipped.slice(0, LISTED).map((r) => (
              <li key={r.row}>
                <span className="import-matched-col">{t('notImportedRow', { row: r.row, name: r.name || t('unnamed') })}</span>
                <span className="import-matched-becomes">{t(`skipped.${r.reason}`)}</span>
              </li>
            ))}
          </ul>
          {skipped.length > LISTED && <p className="import-unused">{t('notImportedMore', { count: skipped.length - LISTED })}</p>}
        </section>
      )}

      <section aria-label={t('mappingTitle')}>
        <h4 className="field-label">{t('mappingTitle')}</h4>
        <ul className="import-matched">
          {used.map((u, i) => (
            <li key={`${u.field}-${i}`}>
              <span className="import-matched-col">{column(u.column, i)}</span>
              <span className="import-matched-becomes">{t(`fields.${u.field}`)}</span>
            </li>
          ))}
        </ul>
        {unused.length > 0 && <p className="import-unused">{t('notUsed', { names: unused.map((n, i) => column(n, i)).join(', ') })}</p>}
        <p className="import-unused">{t('mappingCheck')}</p>
      </section>

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </>
  );
}
