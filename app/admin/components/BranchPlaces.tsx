'use client';

import { useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { stylistsProblem } from '../lib/enrol-validation';
import { ConfirmDialog } from './ConfirmDialog';
import { SecondaryButton, TextInput } from './primitives';
import { oklch } from '../tokens';

export interface BranchPlacesRow {
  id: string;
  name: string;
  active: boolean;
  /** Jira GRW-557 — the branch's own number; null while it uses the plan's. */
  maxProviders: number | null;
  activeStylists: number;
}

/**
 * Jira GRW-557 — how many stylists a branch may have, on the Branches tab: "2 of 5" in its row, and a Change
 * button that sets the branch's own number, with the reason every branch change is audited with.
 *
 * A number below the people already there is allowed (story BR-05) — nobody is turned off, the branch just takes
 * nobody new until it is back under — so the dialog says that before it is saved rather than refusing it.
 */
export function BranchPlaces({
  businessId,
  branch,
  placesDefault,
  canManage,
  onChanged,
}: {
  businessId: string;
  branch: BranchPlacesRow;
  /** The plan's number, which a branch with none of its own has; null when it could not be resolved. */
  placesDefault: number | null;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = branch.maxProviders ?? placesDefault;
  const typed = Number(value.trim());
  const below = !stylistsProblem(value) && typed < branch.activeStylists;

  function save(reason: string) {
    const problem = stylistsProblem(value);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    adminFetch(`/businesses/${businessId}/branches/${branch.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ maxProviders: typed, reason }),
    })
      .then(() => {
        setOpen(false);
        onChanged();
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not change the number of stylists.'))
      .finally(() => setBusy(false));
  }

  return (
    <>
      <span style={{ fontSize: 13, color: oklch.text, whiteSpace: 'nowrap' }}>
        {limit === null ? `${branch.activeStylists} · plan's number` : `${branch.activeStylists} of ${limit}`}
        {branch.maxProviders === null && limit !== null ? (
          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: oklch.textMuted }}>PLAN</span>
        ) : null}
      </span>
      {canManage && branch.active ? (
        <SecondaryButton
          onClick={() => {
            setError(null);
            setValue(limit === null ? '' : String(limit));
            setOpen(true);
          }}
          title={`Change how many stylists ${branch.name} may have`}
        >
          Change
        </SecondaryButton>
      ) : null}

      <ConfirmDialog
        open={open}
        title={`Stylists at ${branch.name}`}
        description={`How many stylists ${branch.name} may have at most. ${branch.activeStylists} ${branch.activeStylists === 1 ? 'is' : 'are'} there now.`}
        confirmLabel={busy ? 'Saving…' : 'Save'}
        reasonRequired
        reasonPlaceholder="Why is this number changing?"
        loading={busy}
        error={error}
        onConfirm={save}
        onCancel={() => setOpen(false)}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <label htmlFor={`places-${branch.id}`} style={{ fontSize: 12.5, fontWeight: 700, color: oklch.textMuted }}>
            Stylists at most
          </label>
          <TextInput
            id={`places-${branch.id}`}
            value={value}
            inputMode="numeric"
            onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={placesDefault === null ? '5' : String(placesDefault)}
          />
          {below ? (
            <span role="status" style={{ fontSize: 12.5, fontWeight: 600, color: oklch.textStrong }}>
              {branch.name} has {branch.activeStylists} active stylists. Nobody is turned off, but nobody new can be added there
              until fewer than {typed} are active.
            </span>
          ) : null}
        </div>
      </ConfirmDialog>
    </>
  );
}
