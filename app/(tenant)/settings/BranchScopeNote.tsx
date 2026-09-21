'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
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
  topic,
}: {
  settings: SettingsSummary;
  branchName: string | null;
  /** The branch-setting keys this tab edits. */
  keys?: string[];
  sameForAll?: boolean;
  /** What is on the tab — a key of `branchScope.topics`, so the note names it in the owner's language. */
  topic: 'hours' | 'bookingRules' | 'teamAccess' | 'reportAccess' | 'reminders' | 'phoneAndDescription';
}) {
  const t = useTranslations('branchScope');
  const what = t(`topics.${topic}`);
  const bold = { b: (chunks: ReactNode) => <strong>{chunks}</strong> };
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (settings.branchCount <= 1) return null;

  const branchId = settings.scope.locationId;
  const own = (keys ?? []).filter((k) => settings.scope.ownKeys.includes(k));

  if (sameForAll) {
    return (
      <div className="bsn bsn-all" role="note">
        <span>{t.rich('sameForAll', { ...bold, what, count: settings.branchCount })}</span>
      </div>
    );
  }
  if (!branchId) {
    return (
      <div className="bsn" role="note">
        <span>{t.rich('allBranches', { ...bold, what })}</span>
      </div>
    );
  }
  if (own.length === 0) {
    return (
      <div className="bsn" role="note">
        <span>{t.rich('usesBusiness', { ...bold, what, branch: branchName ?? '' })}</span>
      </div>
    );
  }
  return (
    <div className="bsn bsn-own" role="note">
      <span>{t.rich('hasOwn', { ...bold, what, branch: branchName ?? '' })}</span>
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
        {busy ? t('resetting') : failed ? t('resetFailed') : t('useBusiness')}
      </button>
    </div>
  );
}
