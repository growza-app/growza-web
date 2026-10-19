'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { samplesFor } from '../services/import-columns';
import { FIELDS, fieldAt, matchedAll, missingRequired, withColumnAs, type ColumnMap, type Field } from './product-import';

/**
 * Match the columns of the owner's file to what a product needs.
 *
 * When the guess found the name and the price — what a conventionally named sheet gets — this is a short
 * confirmation, one line per column, and a Change button. Only when something required is missing, or the owner
 * presses Change, does it open into a card per column of THEIR file, in THEIR order, with a couple of the values
 * in it: they are thinking "what is my Qty column used for", not "where does Stock come from".
 */
export function ImportProductColumns({
  headers,
  rows,
  map,
  onMap,
  onBack,
  onNext,
}: {
  headers: string[];
  rows: string[][];
  map: ColumnMap;
  onMap: (next: ColumnMap) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations('products.import');
  const [changing, setChanging] = useState(() => !matchedAll(map));
  const missing = missingRequired(map);
  const label = (f: Field) => t(`fields.${f}`);
  const headerOf = (i: number) => headers[i] || t('column', { n: i + 1 });
  const unused = headers.map((_, i) => i).filter((i) => fieldAt(map, i) === null);

  return (
    <>
      <p className="confirm-body">{t.rich(changing ? 'mapBody' : 'mapDone', { count: rows.length, b: (chunks) => <strong>{chunks}</strong> })}</p>

      {!changing ? (
        <>
          <ul className="import-matched">
            {headers.map((_, i) => {
              const field = fieldAt(map, i);
              if (!field) return null;
              return (
                <li key={i}>
                  <span className="import-matched-col">{headerOf(i)}</span>
                  <span className="import-matched-becomes">{label(field)}</span>
                </li>
              );
            })}
          </ul>
          {unused.length > 0 && <p className="import-unused">{t('notUsed', { names: unused.map(headerOf).join(', ') })}</p>}
          <button type="button" className="btn btn-ghost import-change" onClick={() => setChanging(true)}>
            {t('change')}
          </button>
        </>
      ) : (
        <>
          {missing.length > 0 && (
            <div role="alert" className="import-need">
              {missing.map((f) => (
                <p key={f}>{t(f === 'name' ? 'missingName' : 'missingPrice')}</p>
              ))}
            </div>
          )}
          <ul className="import-cols">
            {headers.map((_, i) => {
              const samples = samplesFor(rows, i);
              return (
                <li key={i} className="import-col">
                  <div className="import-col-head">
                    <span className="import-col-name">{headerOf(i)}</span>
                    <span className="import-col-sample">{samples.length > 0 ? samples.join(' · ') : t('sampleEmpty')}</span>
                  </div>
                  <label className="import-col-pick">
                    <span className="field-label">{t('becomes')}</span>
                    <select value={fieldAt(map, i) ?? 'skip'} onChange={(e) => onMap(withColumnAs(map, i, e.target.value === 'skip' ? null : (e.target.value as Field)))}>
                      <option value="skip">{t('skipColumn')}</option>
                      {FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {label(f.key)}
                          {f.required ? ` (${t('needed')})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {t('back')}
        </button>
        <button type="button" className="btn" disabled={missing.length > 0} onClick={onNext}>
          {t('check', { count: rows.length })}
        </button>
      </div>
    </>
  );
}
