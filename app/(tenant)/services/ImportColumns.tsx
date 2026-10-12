'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FIELDS, fieldAt, matchedAll, missingRequired, samplesFor, withColumnAs, type ColumnMap, type Field } from './import-columns';

/**
 * Match the columns of the owner's file to what a service needs.
 *
 * Two views of one thing. When the guess found the name and the minutes — which is what a conventionally named
 * sheet gets — it is a short confirmation: what each column becomes, one line each, and a Change button. Only
 * when something required is missing, or the owner presses Change, does it open into a card per column of THEIR
 * file, showing a couple of the values in it and what it becomes. The cards are the file's order, not ours,
 * because the owner is thinking "what is my Minutes column used for", not "where does Duration come from".
 */
export function ImportColumns({
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
  const t = useTranslations('services.import');
  // Asked only when it has to be: a complete guess is confirmed, not interrogated.
  const [changing, setChanging] = useState(() => !matchedAll(map));
  const missing = missingRequired(map);
  const label = (f: Field) => t(`fields.${FIELDS.find((x) => x.key === f)!.labelKey}`);
  const headerOf = (i: number) => headers[i] || t('column', { n: i + 1 });
  const unused = headers.map((_, i) => i).filter((i) => fieldAt(map, i) === null);

  return (
    <>
      <p className="confirm-body">
        {t.rich(changing ? 'mapBody' : 'mapDone', { count: rows.length, b: (chunks) => <strong>{chunks}</strong> })}
      </p>

      {!changing ? (
        <>
          <ul className="import-matched">
            {FIELDS.filter((f) => map[f.key] >= 0).map((f) => (
              <li key={f.key}>
                <span className="import-matched-field">{label(f.key)}</span>
                <span className="import-matched-col">“{headerOf(map[f.key])}”</span>
              </li>
            ))}
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
                <p key={f}>{t(f === 'name' ? 'missingName' : 'missingMinutes')}</p>
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
                    <select
                      value={fieldAt(map, i) ?? 'skip'}
                      onChange={(e) => onMap(withColumnAs(map, i, e.target.value === 'skip' ? null : (e.target.value as Field)))}
                    >
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
