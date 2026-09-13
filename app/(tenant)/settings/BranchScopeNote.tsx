'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, type SettingsSummary } from '../lib/api';

/**
 * Jira GRW-230 — one line at the top of a settings tab saying WHOSE settings
 * these are, so an owner never changes every branch while thinking of one.
 *
 * - `perBranch`: the tab's keys can differ by branch. With a branch picked it
 *   says whether that branch has its own values, and offers to go back to the
 *   business's ("Use business settings").
 * - `sameForAll`: the tab is business-wide (Phase 1 of GRW-230 — booking
 *   rules, report access, team). With a branch picked it says so plainly.
 */
export function BranchScopeNote({
  settings,
  branchName,
  keys,
  sameForAll = false,
  what,
}: {
  settings: SettingsSummary;
  branchName: string | null;
  /** The branch-setting keys this tab edits. */
  keys?: string[];
  sameForAll?: boolean;
  /** "hours", "reminders" — how the note names what is on the tab. */
  what: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (settings.branchCount <= 1) return null;

  const branchId = settings.scope.locationId;
  const own = (keys ?? []).filter((k) => settings.scope.ownKeys.includes(k));

  if (sameForAll) {
    return (
      <div className="bsn bsn-all" role="note">
        <span>
          <strong>Same for every branch.</strong> Changes to {what} here apply to all {settings.branchCount} branches.
        </span>
      </div>
    );
  }
  if (!branchId) {
    return (
      <div className="bsn" role="note">
        <span>
          <strong>All branches.</strong> These {what} are the business default. A branch with its own {what} keeps them.
        </span>
      </div>
    );
  }
  if (own.length === 0) {
    return (
      <div className="bsn" role="note">
        <span>
          <strong>{branchName}</strong> uses the business’s {what}. Change anything here to give {branchName} its own.
        </span>
      </div>
    );
  }
  return (
    <div className="bsn bsn-own" role="note">
      <span>
        <strong>{branchName}</strong> has its own {what}.
      </span>
      <button
        type="button"
        className="bsn-reset"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            await api.resetBranchSettings(branchId, own);
            router.refresh();
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Resetting…' : failed ? 'Could not reset — try again' : 'Use business settings'}
      </button>
    </div>
  );
}
