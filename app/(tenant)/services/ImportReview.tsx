'use client';

import { useState } from 'react';
import { api, formatMoney } from '../lib/api';
import { useLabel } from '../components/LabelsProvider';
import { copy } from '../lib/copy';
import { problem, toImportItems, type Draft } from './import-drafts';

/**
 * The one review table every bulk route ends in (design boards 3a–3d).
 *
 * Rows that cannot be saved are flagged and fixed here rather than dropped, and
 * the write is a single transaction — the import never half-succeeds.
 */
export function ImportReview({
  drafts,
  setDrafts,
  onBack,
  onImported,
  backLabel = 'Back',
  lookup,
}: {
  drafts: Draft[];
  setDrafts: (fn: (prev: Draft[]) => Draft[]) => void;
  onBack: () => void;
  onImported: () => void;
  backLabel?: string;
  /** Re-checks a hand-edited name against the existing catalogue. */
  lookup: (name: string) => Draft['existing'];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serviceWord = useLabel('service', copy.services.name);

  const update = (i: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const active = drafts.filter((d) => !d.skip);
  const blocked = active.filter((d) => problem(d) !== null).length;
  const toCreate = active.filter((d) => !d.existing).length;
  const toReprice = active.filter((d) => d.existing).length;

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.importServices(toImportItems(drafts));
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed — nothing was saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="confirm-body">
        {toCreate} to add{toReprice > 0 && `, ${toReprice} already in your list`}
        {blocked > 0 && ` · ${blocked} need${blocked === 1 ? 's' : ''} fixing`}
      </p>
      <div className="import-review">
        {/* Plain words over the design's own. The board says "Takes", but an owner
            reading this may not be a confident reader, and "Minutes" says both what
            the column is and what unit it wants without being decoded. The mapping
            step upstream uses the same word for the same reason. */}
        <div className="import-row import-head" aria-hidden="true">
          <span className="ih-pad">{serviceWord}</span>
          <span className="ih-pad">{copy.services.duration}</span>
          <span>{copy.services.price}</span>
          <span>{copy.services.status}</span>
          <span />
        </div>
        {drafts.map((d, i) => {
          const issue = d.skip ? null : problem(d);
          return (
            <div key={i} className={`import-row ${d.skip ? 'is-skipped' : ''} ${issue ? 'is-bad' : ''}`}>
              <input
                type="text"
                value={d.name}
                aria-label={`Row ${i + 1} name`}
                onChange={(e) => update(i, { name: e.target.value, existing: lookup(e.target.value) })}
              />
              {/* A duplicate row is a re-price and nothing else — the import sends
                  the existing service's own duration. Leaving this editable let the
                  owner type a number that was silently thrown away. */}
              <input
                type="text"
                value={d.existing ? String(d.existing.durationMin) : d.durationMin}
                readOnly={!!d.existing}
                title={d.existing ? 'Only the price changes for a service you already have' : undefined}
                aria-label={`Row ${i + 1} minutes`}
                onChange={(e) => update(i, { durationMin: e.target.value })}
              />
              {/* The rupee sits outside the box, so the owner types a bare
                  number and never wonders whether the symbol belongs in it. */}
              <span className="import-money">
                <span className="import-money-sym" aria-hidden="true">
                  ₹
                </span>
                <input
                  type="text"
                  value={d.price}
                  aria-label={`Row ${i + 1} price in rupees`}
                  onChange={(e) => update(i, { price: e.target.value })}
                />
              </span>
              <span className="import-note">
                {d.existing ? (
                  <span className="chip chip-reminder">
                    {d.existing.active ? 'Already have it' : 'Retired — will come back'} —{' '}
                    {formatMoney(d.existing.priceMinor, d.existing.currency)} → re-price
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
      {error && <div role="alert" className="field-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onBack}>
          {backLabel}
        </button>
        <button type="button" className="btn" disabled={busy || blocked > 0 || active.length === 0} onClick={apply}>
          {busy ? 'Importing…' : blocked > 0 ? `Fix ${blocked} row${blocked === 1 ? '' : 's'} first` : `Import ${active.length}`}
        </button>
      </div>
    </>
  );
}
