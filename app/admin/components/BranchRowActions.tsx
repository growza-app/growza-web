'use client';

import { useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { BranchBillPreview } from './BranchBillPreview';
import { ConfirmDialog } from './ConfirmDialog';
import { SecondaryButton } from './primitives';

/**
 * Jira GRW-246 — Reopen a closed branch (same id, so its bookings and history
 * still join to it) and Make main, on the admin Branches tab. Reopening raises
 * the bill like an add, so its dialog shows the same preview (GRW-240); both ask
 * for the reason every branch change is audited with.
 */
export function BranchRowActions({
  businessId,
  branch,
  onChanged,
}: {
  businessId: string;
  branch: { id: string; name: string; active: boolean; isMain: boolean };
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<'reopen' | 'make-main' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(reason: string) {
    if (!open) return;
    setBusy(true);
    setError(null);
    adminFetch(`/businesses/${businessId}/branches/${branch.id}/${open}`, { method: 'POST', body: JSON.stringify({ reason }) })
      .then(() => {
        setOpen(null);
        onChanged();
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : 'Could not change the branch.'))
      .finally(() => setBusy(false));
  }

  return (
    <>
      {!branch.active ? (
        <SecondaryButton
          onClick={() => {
            setError(null);
            setOpen('reopen');
          }}
        >
          Reopen
        </SecondaryButton>
      ) : !branch.isMain ? (
        <SecondaryButton
          onClick={() => {
            setError(null);
            setOpen('make-main');
          }}
        >
          Make main
        </SecondaryButton>
      ) : null}

      <ConfirmDialog
        open={open === 'reopen'}
        title={`Reopen ${branch.name}?`}
        description="It opens again with the same records: its past bookings, staff history and reports stay joined to it. It counts toward the plan's branch limit and the bill."
        confirmLabel={busy ? 'Reopening…' : 'Reopen branch'}
        reasonRequired
        reasonPlaceholder="Why is this branch being reopened?"
        loading={busy}
        error={error}
        onConfirm={run}
        onCancel={() => setOpen(null)}
      >
        <BranchBillPreview businessId={businessId} change="add" open={open === 'reopen'} />
      </ConfirmDialog>

      <ConfirmDialog
        open={open === 'make-main'}
        title={`Make ${branch.name} the main branch?`}
        description="It moves to the top of the list. The owner's Business profile edits it, and anything that names no branch lands here. No bill changes."
        confirmLabel={busy ? 'Saving…' : 'Make main'}
        reasonRequired
        reasonPlaceholder="Why is the main branch changing?"
        loading={busy}
        error={error}
        onConfirm={run}
        onCancel={() => setOpen(null)}
      />
    </>
  );
}
