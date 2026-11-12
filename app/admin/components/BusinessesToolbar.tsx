'use client';

import { useEffect, useState } from 'react';
import { adminDownload, AdminApiError } from '../lib/api';
import { loadSaved, storeSaved, withoutSaved, withSaved, type SavedFilter } from '../lib/saved-filters';
import { oklch } from '../tokens';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';

type Filters = Omit<SavedFilter, 'name'>;

/** What the export route takes: only the filters actually set ('All' means none). */
export function exportBody(f: Filters): Record<string, string> {
  const body: Record<string, string> = {};
  if (f.search.trim().length >= 2) body.search = f.search.trim();
  if (f.vertical !== 'All') body.vertical = f.vertical;
  if (f.status !== 'All') body.status = f.status;
  return body;
}

const chip = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 36,
  padding: '0 12px',
  borderRadius: 999,
  border: `1px solid ${oklch.border}`,
  background: 'white',
  fontSize: '0.8125rem',
  fontWeight: 700,
  color: oklch.textStrong,
  cursor: 'pointer',
} as const;

/**
 * Jira GRW-702 — saved views and a CSV file for the Businesses list.
 *
 * A saved view is a chip that puts its filters back in one tap; the × removes it. Export downloads exactly what the
 * list shows (the same filters, every page), without owner phone numbers, and the API audits it. With nothing in the
 * list there is nothing to export, so the button is off.
 */
export function BusinessesToolbar({
  current,
  canSave,
  canExport = true,
  total,
  onApply,
}: {
  current: Filters;
  /** QA loophole L4 — `admin.business.export`; without it there is no Export button at all. */
  canExport?: boolean;
  /** A view is worth saving only when some filter is set. */
  canSave: boolean;
  total: number | null;
  onApply: (f: Filters) => void;
}) {
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSaved(loadSaved()), []);

  const update = (next: SavedFilter[]) => {
    setSaved(next);
    storeSaved(next);
  };

  const save = () => {
    if (!name.trim()) return;
    update(withSaved(saved, { ...current, name }));
    setName('');
    setNaming(false);
  };

  const download = () => {
    setBusy(true);
    setError(null);
    adminDownload('/businesses/export', { method: 'POST', body: JSON.stringify(exportBody(current)) })
      .then(({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not export. Try again.'))
      .finally(() => setBusy(false));
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      {saved.map((f) => (
        <span key={f.name} style={{ ...chip, padding: 0, gap: 0 }}>
          <button type="button" onClick={() => onApply(f)} style={{ all: 'unset', cursor: 'pointer', padding: '0 4px 0 12px', minHeight: 36, display: 'inline-flex', alignItems: 'center' }}>
            {f.name}
          </button>
          <button
            type="button"
            aria-label={`Remove saved view ${f.name}`}
            onClick={() => update(withoutSaved(saved, f.name))}
            style={{ all: 'unset', cursor: 'pointer', minWidth: 32, minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: oklch.textFaint }}
          >
            ×
          </button>
        </span>
      ))}
      {naming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
        >
          <input
            autoFocus={autoFocusField()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this view"
            aria-label="Name this view"
            maxLength={30}
            style={{ minHeight: 36, padding: '0 10px', borderRadius: 10, border: `1px solid ${oklch.borderStrong}`, fontSize: '1rem', width: '11rem' }}
          />
          <button type="submit" disabled={!name.trim()} style={{ ...chip, opacity: name.trim() ? 1 : 0.5 }}>
            Save
          </button>
          <button type="button" onClick={() => setNaming(false)} style={{ ...chip, border: 'none', background: 'transparent', color: oklch.textMuted }}>
            Cancel
          </button>
        </form>
      ) : canSave ? (
        <button type="button" onClick={() => setNaming(true)} style={{ ...chip, borderStyle: 'dashed', color: oklch.textMuted }}>
          + Save this view
        </button>
      ) : null}
      {canExport ? (
        <button
          type="button"
          onClick={download}
          disabled={!total || busy}
          title={total ? `Download these ${total} businesses as a CSV file` : 'Nothing to export'}
          style={{ ...chip, marginLeft: 'auto', opacity: !total || busy ? 0.5 : 1, cursor: !total || busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Exporting…' : 'Export CSV'}
        </button>
      ) : null}
      {error ? (
        <div role="alert" style={{ flexBasis: '100%', fontSize: '0.8125rem', color: oklch.danger }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
