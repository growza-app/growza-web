'use client';

import { useMemo, useRef, useState } from 'react';
import { api, type ServiceAdmin } from '../lib/api';
import { byNameIndex, type Draft } from './import-drafts';
import { ImportReview } from './ImportReview';

type Field = 'name' | 'categoryName' | 'durationMin' | 'bufferAfterMin' | 'priceMinor';

const FIELDS: { key: Field; label: string; required: boolean; hints: string[] }[] = [
  { key: 'name', label: 'Service name', required: true, hints: ['service', 'name', 'treatment', 'item'] },
  { key: 'categoryName', label: 'Type', required: false, hints: ['type', 'category', 'group', 'section'] },
  // "Labour hrs" is the design's own example of a column that should map to
  // duration without the owner reformatting their file. The board calls this
  // "Takes"; we say "Minutes", which names the unit and needs no decoding.
  { key: 'durationMin', label: 'Minutes', required: true, hints: ['duration', 'mins', 'minutes', 'time', 'takes', 'labour', 'hrs'] },
  { key: 'bufferAfterMin', label: 'Cleanup after (minutes)', required: false, hints: ['cleanup', 'buffer', 'gap', 'turnaround'] },
  { key: 'priceMinor', label: 'Price', required: false, hints: ['price', 'rate', 'cost', 'amount', 'charge', 'fee'] },
];

/** Best-guess mapping so a conventionally-named sheet needs no work at all. */
function suggest(headers: string[]): Record<Field, number> {
  const used = new Set<number>();
  const out = {} as Record<Field, number>;
  for (const f of FIELDS) {
    const i = headers.findIndex(
      (h, idx) => !used.has(idx) && f.hints.some((hint) => h.toLowerCase().includes(hint)),
    );
    out[f.key] = i;
    if (i >= 0) used.add(i);
  }
  return out;
}

/**
 * Import a price list from a spreadsheet: pick the file, confirm which column
 * is which, then check every row before anything is written.
 *
 * Rows that cannot be saved are flagged and fixed inline rather than dropped,
 * and the write is one transaction — the import never half-succeeds.
 */
export function ImportServices({
  existing,
  onClose,
  onImported,
}: {
  existing: ServiceAdmin[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<'pick' | 'map' | 'review'>('pick');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<Field, number>>({} as Record<Field, number>);
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
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const buildDrafts = () => {
    const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '') : '');
    setDrafts(
      rows.map((r) => {
        const name = at(r, map.name).trim();
        return {
          name,
          categoryName: at(r, map.categoryName).trim(),
          durationMin: at(r, map.durationMin).replace(/[^\d.]/g, ''),
          bufferAfterMin: at(r, map.bufferAfterMin).replace(/[^\d.]/g, ''),
          // Strips "₹", commas and stray spaces so "₹1,500" imports as 1500.
          price: at(r, map.priceMinor).replace(/[^\d.]/g, ''),
          existing: byName.get(name.toLowerCase()) ?? null,
          skip: false,
        };
      }),
    );
    setStep('review');
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Import your price list</h3>

        {step === 'pick' && (
          <>
            <p className="confirm-body">
              Upload the spreadsheet you already have — an Excel file (.xlsx) or a CSV. You&apos;ll check every row before
              anything is saved.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              style={{ display: 'none' }}
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Reading…' : 'Choose file'}
            </button>
          </>
        )}

        {step === 'map' && (
          <>
            <p className="confirm-body">
              We found <strong>{rows.length}</strong> rows. Confirm which column is which — your file doesn&apos;t need
              renaming.
            </p>
            <div className="import-map">
              {FIELDS.map((f) => (
                <label key={f.key} className="field">
                  <span className="field-label">
                    {f.label} {f.required && '*'}
                  </span>
                  <select
                    value={map[f.key] ?? -1}
                    onChange={(e) => setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                  >
                    <option value={-1}>— not in my file —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStep('pick')}>
                Back
              </button>
              <button type="button" className="btn" disabled={map.name < 0 || map.durationMin < 0} onClick={buildDrafts}>
                Check {rows.length} rows
              </button>
            </div>
          </>
        )}

        {step === 'review' && (
          <ImportReview
            drafts={drafts}
            setDrafts={setDrafts}
            onBack={() => setStep('map')}
            onImported={onImported}
            lookup={(name) => byName.get(name.trim().toLowerCase()) ?? null}
          />
        )}

        {step !== 'review' && error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}
        {step === 'pick' && (
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
