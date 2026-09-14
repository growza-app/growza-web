'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError, api, type BranchClosePreview } from '../../lib/api';

/**
 * Jira GRW-246 — the owner closes a branch, or makes it the main one.
 *
 * Asks why (it is written to the audit log, as support's own changes are). Closing
 * first shows what it does to the bill: lower from the next billing date, with
 * nothing for the owner to approve (owner decision, 2026-09-14). A refusal —
 * staff or bookings still there, or it is the main branch — is shown in the
 * dialog, in the server's own words.
 */
export function BranchActionDialog({
  action,
  branch,
  onDone,
  onCancel,
}: {
  action: 'close' | 'make-main';
  branch: { id: string; name: string };
  onDone: () => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BranchClosePreview | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    reasonRef.current?.focus();
    if (action === 'close') api.branchClosePreview(branch.id).then(setPreview).catch(() => setPreview(null));
  }, [action, branch.id]);

  const money = (currency: string, minor: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
  const day = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  const submit = async () => {
    if (!reason.trim()) {
      setError('Say why.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (action === 'close') await api.closeBranch(branch.id, reason.trim());
      else await api.makeMainBranch(branch.id, reason.trim());
      onDone();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not save — check the server is running.');
      setBusy(false);
    }
  };

  const title = action === 'close' ? `Close ${branch.name}?` : `Make ${branch.name} your main branch?`;
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal modal-fit confirm-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="modal-body">
          <p className="confirm-body">
            {action === 'close'
              ? `It disappears from your branches, the booking sheet and Home. Its past bookings stay in Reports. To open it again later, ask Growza support.`
              : `It moves to the top of your branches, and Business profile edits its address and phone. Nothing else about your other branches changes.`}
          </p>
          {action === 'close' && preview?.subscription && preview.differenceMinor !== 0 ? (
            <p className="confirm-detail" data-testid="branch-close-bill">
              Your bill goes down from {day(preview.effectiveFrom)}: {money(preview.currency, preview.monthlyAfterMinor)} a month (now{' '}
              {money(preview.currency, preview.monthlyBeforeMinor)}). Nothing to approve.
            </p>
          ) : null}
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor={`branch-${action}-reason`}>
              <span>Why?</span>
            </label>
            <textarea
              id={`branch-${action}-reason`}
              ref={reasonRef}
              rows={2}
              value={reason}
              maxLength={200}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              placeholder={action === 'close' ? 'For example: lease ended' : 'For example: the new flagship'}
            />
          </div>
          {error ? (
            <div className="field-error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`btn ${action === 'close' ? 'btn-danger-solid' : ''}`} disabled={busy} onClick={() => void submit()}>
            {busy ? 'Working…' : action === 'close' ? 'Close branch' : 'Make main'}
          </button>
        </div>
      </div>
    </div>
  );
}
