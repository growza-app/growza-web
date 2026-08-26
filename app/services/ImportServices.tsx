'use client';

import { useMemo, useRef, useState } from 'react';
import { api, formatMoney, type ServiceAdmin, type ServiceImportItem } from '../lib/api';

type Field = 'name' | 'categoryName' | 'durationMin' | 'bufferAfterMin' | 'priceMinor';

const FIELDS: { key: Field; label: string; required: boolean; hints: string[] }[] = [
  { key: 'name', label: 'Service name', required: true, hints: ['service', 'name', 'treatment', 'item'] },
  { key: 'categoryName', label: 'Type', required: false, hints: ['type', 'category', 'group', 'section'] },
  // "Labour hrs" is the design's own example of a column that should map to
  // Takes without the owner reformatting their file.
  { key: 'durationMin', label: 'Takes (minutes)', required: true, hints: ['duration', 'mins', 'minutes', 'time', 'takes', 'labour', 'hrs'] },
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

interface Draft {
  name: string;
  categoryName: string;
  durationMin: string;
  bufferAfterMin: string;
  price: string;
  /** Set when a service of this name already exists — the design's "offer a price update instead of a second copy". */
  existing: ServiceAdmin | null;
  skip: boolean;
}

function problem(d: Draft): string | null {
  if (d.existing) return null; // re-pricing only needs a price
  if (!d.name.trim()) return 'Needs a name';
  const dur = Number(d.durationMin);
  if (!d.durationMin.trim() || !Number.isFinite(dur) || dur <= 0) return 'Needs how long it takes';
  if (dur > 12 * 60) return 'Longer than 12 hours';
  if (d.price.trim() && (!Number.isFinite(Number(d.price)) || Number(d.price) < 0)) return 'Price is not a number';
  return null;
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

  const update = (i: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const active = drafts.filter((d) => !d.skip);
  const blocked = active.filter((d) => problem(d) !== null).length;
  const toCreate = active.filter((d) => !d.existing).length;
  const toReprice = active.filter((d) => d.existing).length;

  const apply = async () => {
    setBusy(true);
    setError(null);
    const items: ServiceImportItem[] = active.map((d) =>
      d.existing
        ? {
            mode: 'updatePrice',
            existingId: d.existing.id,
            name: d.existing.name,
            durationMin: d.existing.durationMin,
            priceMinor: d.price.trim() ? Math.round(Number(d.price) * 100) : null,
          }
        : {
            mode: 'create',
            name: d.name.trim(),
            categoryName: d.categoryName.trim() || null,
            durationMin: Number(d.durationMin),
            bufferAfterMin: Number(d.bufferAfterMin) || 0,
            priceMinor: d.price.trim() ? Math.round(Number(d.price) * 100) : null,
          },
    );
    try {
      await api.importServices(items);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed — nothing was saved.');
    } finally {
      setBusy(false);
    }
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
          <>
            <p className="confirm-body">
              {toCreate} to add{toReprice > 0 && `, ${toReprice} already in your list`}
              {blocked > 0 && ` · ${blocked} need${blocked === 1 ? 's' : ''} fixing`}
            </p>
            <div className="import-review">
              {drafts.map((d, i) => {
                const issue = d.skip ? null : problem(d);
                return (
                  <div key={i} className={`import-row ${d.skip ? 'is-skipped' : ''} ${issue ? 'is-bad' : ''}`}>
                    <input
                      type="text"
                      value={d.name}
                      aria-label={`Row ${i + 1} name`}
                      onChange={(e) => update(i, { name: e.target.value, existing: byName.get(e.target.value.trim().toLowerCase()) ?? null })}
                    />
                    <input
                      type="text"
                      value={d.durationMin}
                      aria-label={`Row ${i + 1} minutes`}
                      placeholder="mins"
                      onChange={(e) => update(i, { durationMin: e.target.value })}
                    />
                    <input
                      type="text"
                      value={d.price}
                      aria-label={`Row ${i + 1} price`}
                      placeholder="price"
                      onChange={(e) => update(i, { price: e.target.value })}
                    />
                    <span className="import-note">
                      {d.existing ? (
                        <span className="chip chip-reminder">
                          Already have it — {formatMoney(d.existing.priceMinor, d.existing.currency)} → re-price
                        </span>
                      ) : issue ? (
                        <span className="import-issue">{issue}</span>
                      ) : (
                        <span className="muted">New</span>
                      )}
                    </span>
                    <button type="button" className="btn btn-ghost" onClick={() => update(i, { skip: !d.skip })}>
                      {d.skip ? 'Include' : 'Skip'}
                    </button>
                  </div>
                );
              })}
            </div>
            {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setStep('map')}>
                Back
              </button>
              <button type="button" className="btn" disabled={busy || blocked > 0 || active.length === 0} onClick={apply}>
                {busy ? 'Importing…' : blocked > 0 ? `Fix ${blocked} row${blocked === 1 ? '' : 's'} first` : `Import ${active.length}`}
              </button>
            </div>
          </>
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
