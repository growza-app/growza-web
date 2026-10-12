'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { api, type ServiceAdmin } from '../lib/api';
import { type Draft } from './import-drafts';
import { ImportReview } from './ImportReview';
import { ImportColumns } from './ImportColumns';
import { suggest, type ColumnMap, type Field } from './import-columns';

/**
 * Import a price list from a spreadsheet: pick the file, confirm which column
 * is which, then check every row before anything is written.
 *
 * Rows that cannot be saved are flagged and fixed inline rather than dropped,
 * and the write is one transaction — the import never half-succeeds.
 */
export function ImportServices({
  existing,
  branchId,
  onClose,
  onImported,
}: {
  /** Jira GRW-378 — the branch this screen is showing; everything added here lands there. */
  branchId: string;

  existing: ServiceAdmin[];
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useTranslations('services.import');
  const [step, setStep] = useState<'pick' | 'map' | 'review'>('pick');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<ColumnMap>({} as ColumnMap);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const byName = useMemo(() => new Map(existing.map((s) => [s.name.trim().toLowerCase(), s])), [existing]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const sheet = await api.parseServiceSheet(file);
      setHeaders(sheet.headers);
      setRows(sheet.rows);
      setMap(suggest(sheet.headers));
      setStep('map');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('readFailed'));
    } finally {
      setBusy(false);
    }
  };

  const buildDrafts = () => {
    const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '') : '');
    /*
     * Jira GRW-473 — minutes are whole, and an hours column is hours. "Labour hrs" is offered as a duration column,
     * but its 1.5 went through as 1.5 MINUTES, and any fraction then failed in the database. An hours column is
     * multiplied out; any other is rounded to the nearest minute.
     */
    const hoursColumn = map.durationMin >= 0 && /\b(hrs?|hours?)\b/i.test(headers[map.durationMin] ?? '');
    const minutes = (raw: string, perUnit: number) => {
      const cleaned = raw.replace(/[^\d.]/g, '');
      if (!cleaned) return '';
      const n = Number(cleaned);
      return Number.isFinite(n) ? String(Math.round(n * perUnit)) : cleaned;
    };
    // Jira GRW-473 — a name twice in the file becomes one service: the repeat starts skipped (the owner can still
    // tick it, and the server then says which row clashes).
    const seen = new Set<string>();
    setDrafts(
      rows.map((r) => {
        const name = at(r, map.name).trim();
        const key = name.toLowerCase();
        const existing = byName.get(key) ?? null;
        const repeat = !existing && key !== '' && seen.has(key);
        if (key) seen.add(key);
        return {
          name,
          categoryName: at(r, map.categoryName).trim(),
          durationMin: minutes(at(r, map.durationMin), hoursColumn ? 60 : 1),
          bufferAfterMin: minutes(at(r, map.bufferAfterMin), 1),
          // Strips "₹", commas and stray spaces so "₹1,500" imports as 1500.
          price: at(r, map.priceMinor).replace(/[^\d.]/g, ''),
          existing,
          skip: repeat,
        };
      }),
    );
    setStep('review');
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{step === 'map' ? t('mapTitle') : step === 'review' ? t('reviewTitle', { count: drafts.length }) : t('title')}</h3>

        {step === 'pick' && (
          <>
            <p className="confirm-body">{t('pickBody')}</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              style={{ display: 'none' }}
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? t('reading') : t('chooseFile')}
            </button>
          </>
        )}

        {step === 'map' && (
          <ImportColumns headers={headers} rows={rows} map={map} onMap={setMap} onBack={() => setStep('pick')} onNext={buildDrafts} />
        )}

        {step === 'review' && (
          <ImportReview
            drafts={drafts}
            setDrafts={setDrafts}
            onBack={() => setStep('map')}
            onImported={onImported}
            lookup={(name) => byName.get(name.trim().toLowerCase()) ?? null}
            branchId={branchId}
          />
        )}

        {step !== 'review' && error && <div role="alert" className="field-error" style={{ marginTop: 12 }}>{error}</div>}
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
