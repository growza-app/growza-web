'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type SettingsSummary } from '../lib/api';

/**
 * Jira GRW-230 — one line at the top of a settings tab saying WHOSE settings
 * these are, so an owner never changes every branch while thinking of one.
 * Shown only at a business with more than one branch.
 *
 * - A branch tab (`keys`): says whether the branch has its own values or uses
 *   the business's, and offers "Use business settings" when it has its own.
 *   Jira GRW-396 — and "Apply to all branches": Settings has no "all
 *   branches" view any more, so this is how one branch's hours, rules or
 *   reminders become every branch's.
 * - `sameForAll`: a whole-business tab (team, who sees what) says so plainly.
 *
 * Rendered by the PAGE, outside the form it describes, and keyed by branch
 * there: a question asked about Indiranagar must not still be open, now about
 * Koramangala, after the header moves (QA).
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
  /** The branch-setting keys this tab edits — what "its own", "Use business settings" and "Apply to all" mean here. */
  keys?: string[];
  sameForAll?: boolean;
  /** What is on the tab — a key of `branchScope.topics`, so the note names it in the owner's language. */
  topic: 'hours' | 'bookingRules' | 'teamAccess' | 'reportAccess' | 'reminders';
}) {
  const t = useTranslations('branchScope');
  const what = t(`topics.${topic}`);
  const bold = { b: (chunks: ReactNode) => <strong>{chunks}</strong> };
  const router = useRouter();
  const [busy, setBusy] = useState<'reset' | 'apply' | null>(null);
  const [failed, setFailed] = useState<'reset' | 'apply' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState(false);
  /** Where focus goes when the question closes (answered or not), and when it opens: never the page (QA). */
  const applyAllRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [focusTo, setFocusTo] = useState<'applyAll' | 'confirm' | null>(null);
  useEffect(() => {
    if (focusTo === null) return;
    (focusTo === 'confirm' ? confirmRef : applyAllRef).current?.focus();
    setFocusTo(null);
  }, [focusTo]);
  // "All 3 branches now have these hours" is true until the next save, which this note does not see — so it
  // says it for a moment and goes back to the plain line.
  useEffect(() => {
    if (!applied) return;
    const timer = setTimeout(() => setApplied(false), 6000);
    return () => clearTimeout(timer);
  }, [applied]);
  if (settings.branchCount <= 1) return null;

  if (sameForAll) {
    return (
      <div className="bsn bsn-all" role="note">
        <span>{t.rich('sameForAll', { ...bold, what, count: settings.branchCount })}</span>
      </div>
    );
  }
  const branchId = settings.scope.locationId;
  if (!branchId || !keys || keys.length === 0) return null;
  const branch = branchName ?? '';
  const own = keys.filter((k) => settings.scope.ownKeys.includes(k));
  /*
   * "Uses the business's hours" was said of a branch when the business had none either (QA, GRW-516): the branch
   * then has no opening hours at all. At branch scope `workingHours` is the branch's own, else the business's, so
   * an empty list with nothing of its own means there is nothing to use.
   */
  const noHoursYet = topic === 'hours' && own.length === 0 && settings.workingHours.length === 0;

  const run = async (kind: 'reset' | 'apply') => {
    setBusy(kind);
    setFailed(null);
    setApplied(false);
    try {
      if (kind === 'reset') {
        await api.resetBranchSettings(branchId, own);
        // The form below is showing the branch's own values; they are gone, so it is drawn again from the start.
        window.location.reload();
        return;
      }
      await api.applyBranchSettingsToAll(branchId, keys);
      setConfirming(false);
      setApplied(true);
      setFocusTo('applyAll');
      router.refresh();
    } catch {
      setFailed(kind);
    } finally {
      setBusy(null);
    }
  };

  if (confirming) {
    return (
      <div className="bsn bsn-confirm" role="group" aria-label={t('applyAll')}>
        <span>{t.rich('applyConfirm', { ...bold, what, branch, count: settings.branchCount })}</span>
        <span className="bsn-actions">
          <button ref={confirmRef} type="button" className="bsn-reset bsn-apply" disabled={busy !== null} onClick={() => void run('apply')}>
            {busy === 'apply' ? t('applying') : failed === 'apply' ? t('applyFailed') : t('apply')}
          </button>
          <button
            type="button"
            className="bsn-reset"
            disabled={busy !== null}
            onClick={() => {
              setConfirming(false);
              setFocusTo('applyAll');
            }}
          >
            {t('cancel')}
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className={`bsn ${own.length > 0 ? 'bsn-own' : ''}`} role="note">
      <span aria-live="polite">
        {applied
          ? t.rich('applied', { ...bold, what, count: settings.branchCount })
          : t.rich(own.length > 0 ? 'hasOwn' : noHoursYet ? 'noHoursYet' : 'usesBusiness', { ...bold, what, branch })}
      </span>
      <span className="bsn-actions">
        {own.length > 0 ? (
          <button type="button" className="bsn-reset" disabled={busy !== null} onClick={() => void run('reset')}>
            {busy === 'reset' ? t('resetting') : failed === 'reset' ? t('resetFailed') : t('useBusiness')}
          </button>
        ) : null}
        <button
          ref={applyAllRef}
          type="button"
          className="bsn-reset"
          disabled={busy !== null}
          onClick={() => {
            setConfirming(true);
            setFocusTo('confirm');
          }}
        >
          {t('applyAll')}
        </button>
      </span>
    </div>
  );
}
