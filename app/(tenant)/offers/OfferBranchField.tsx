'use client';

import { useTranslations } from 'next-intl';
import { useBranch } from '../components/BranchProvider';

/**
 * Jira GRW-381 — where a new offer runs: one branch, or published to every branch as its own copy.
 *
 * Opens on the header's branch (the main one on "All branches"). A business with one branch, or a member held to
 * one, sees nothing: there is nothing to choose, and the server puts the offer at the only branch they have.
 */
export function OfferBranchField({
  value,
  onChange,
  allBranches,
  onAllBranches,
  disabled = false,
}: {
  value: string | null;
  onChange: (id: string) => void;
  allBranches: boolean;
  onAllBranches: (all: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('offers.branch');
  const branch = useBranch();
  if (!branch.multi || branch.pinned) return null;
  return (
    <div className="field offer-branch-field">
      <label htmlFor="offer-branch">
        <span>{t('which')}</span>
      </label>
      <select id="offer-branch" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {branch.branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <label className="offer-branch-all">
        <input type="checkbox" checked={allBranches} disabled={disabled} onChange={(e) => onAllBranches(e.target.checked)} />
        <span>{t('allBranches')}</span>
      </label>
      <span className="field-hint">{allBranches ? t('allBranchesHint') : t('oneBranchHint')}</span>
    </div>
  );
}

/** The branch a new offer opens on: the header's, else the main one. */
export function useDefaultOfferBranch(): string | null {
  const branch = useBranch();
  return branch.choice ?? branch.one;
}
