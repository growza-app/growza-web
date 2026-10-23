'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Shared confirmation modal, on the app's existing `.modal` shell.
 *
 * Replaces `window.confirm` for anything the owner should see clearly: the
 * native dialog can't say what a change actually costs (how many bookings sit
 * in the slots being closed), can't be styled, and on some mobile browsers is
 * a system sheet that looks like it came from the OS rather than from Growza.
 */
export function ConfirmDialog({
  title,
  body,
  detail,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  busy = false,
  error,
  children,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  /** Optional second line — the consequence, when there is one worth spelling out. */
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  /**
   * Jira GRW-435 — why it was refused, shown without closing the dialog.
   *
   * A destructive action can fail for a reason the owner can act on, and the owner is looking right here when it
   * does. Offers had no surface for that at all: `removeOffer` was a `try/finally` with no `catch`, so the API's
   * "Somebody is waiting for this right now" (GRW-434) was built, sent, parsed into `ApiError.message` and then
   * dropped — the spinner stopped, the row stayed, and nothing was said. Closing the dialog to show the sentence
   * somewhere else would be worse: the owner loses the thing they were deciding about.
   */
  error?: string | null;
  /** A choice the action needs before it goes ahead (QA 2026-10-23 — "can they be sold again?"), drawn under the body. */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('common');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Jira GRW-342 — Escape, Tab kept inside, focus back on the button that opened it. Declared first so the
  // confirm button below is what ends up focused.
  useDialog(dialogRef, { onClose: busy ? undefined : onCancel });

  // QA 2026-10-23 — a destructive dialog opens on the way OUT: Enter, or a stray tap of the key, must not do the thing that cannot be undone.
  // Apple's HIG says the same — the default button of a destructive alert is never the destructive one.
  useEffect(() => {
    (tone === 'danger' ? cancelRef : confirmRef).current?.focus();
    // Focus once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div
        className="modal modal-fit confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        <div className="modal-body">
          <p className="confirm-body">{body}</p>
          {detail && <p className="confirm-detail">{detail}</p>}
          {children}
          {/* `alert` so a refusal that appears after the dialog is already open is announced, not just painted. */}
          {error && (
            <p className="confirm-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel ?? t('cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${tone === 'danger' ? 'btn-danger-solid' : ''}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? t('working') : (confirmLabel ?? t('confirm'))}
          </button>
        </div>
      </div>
    </div>
  );
}
