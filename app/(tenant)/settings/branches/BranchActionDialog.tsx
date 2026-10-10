'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api, type BranchClosePreview } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useDialog } from '../../../shared/a11y/useDialog';
import { opensSoftKeyboard } from '../../../shared/a11y/soft-keyboard';

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
  const t = useTranslations('settingsBranches');
  const locale = `${useLocale()}-IN`;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BranchClosePreview | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose: busy ? undefined : onCancel });

  useEffect(() => {
    // Not on a phone: this dialog explains what closing a branch does, and the keyboard would cover the
    // explanation before it has been read.
    if (!opensSoftKeyboard()) reasonRef.current?.focus();
    if (action === 'close') api.branchClosePreview(branch.id).then(setPreview).catch(() => setPreview(null));
  }, [action, branch.id]);

  const money = (currency: string, minor: number) => formatMoney(minor, currency, locale);
  const day = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  const submit = async () => {
    if (!reason.trim()) {
      setError(t('dialog.sayWhy'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (action === 'close') await api.closeBranch(branch.id, reason.trim());
      else await api.makeMainBranch(branch.id, reason.trim());
      onDone();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : t('errors.saveFailed'));
      setBusy(false);
    }
  };

  const title = action === 'close' ? t('dialog.closeTitle', { name: branch.name }) : t('dialog.makeMainTitle', { name: branch.name });
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal modal-fit confirm-modal" role="dialog" aria-modal="true" aria-label={title} ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="modal-body">
          <p className="confirm-body">
            {action === 'close' ? t('dialog.closeBody') : t('dialog.makeMainBody')}
          </p>
          {action === 'close' && preview?.subscription && preview.differenceMinor !== 0 ? (
            <p className="confirm-detail" data-testid="branch-close-bill">
              {t('dialog.billDown', {
                date: day(preview.effectiveFrom),
                after: money(preview.currency, preview.monthlyAfterMinor),
                before: money(preview.currency, preview.monthlyBeforeMinor),
              })}
            </p>
          ) : null}
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor={`branch-${action}-reason`}>
              <span>{t('dialog.why')}</span>
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
              placeholder={action === 'close' ? t('dialog.whyClosePlaceholder') : t('dialog.whyMakeMainPlaceholder')}
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
            {t('dialog.cancel')}
          </button>
          <button type="button" className={`btn ${action === 'close' ? 'btn-danger-solid' : ''}`} disabled={busy} onClick={() => void submit()}>
            {busy ? t('dialog.working') : action === 'close' ? t('closeBranch') : t('makeMain')}
          </button>
        </div>
      </div>
    </div>
  );
}
