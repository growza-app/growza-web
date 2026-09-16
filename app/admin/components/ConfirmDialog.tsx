'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Icon } from '../icons';
import { oklch } from '../tokens';
import { PrimaryButton, SecondaryButton, TextInput } from './primitives';

/**
 * GRW-96's confirmation primitive. Names the target, states the consequence,
 * and — for the actions GRW-97/98 will make release-blocking (suspension,
 * discount changes, entitlement overrides) — captures a reason nothing can
 * bypass. Confirm stays disabled until a required reason is non-empty; that
 * rule lives here once rather than being re-implemented per screen.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will and will not happen — the consequence, stated plainly. */
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, a reason field renders and Confirm is disabled until it is non-blank. */
  reasonRequired?: boolean;
  /**
   * How long that reason has to be, trimmed. Defaults to 1 — "non-blank",
   * which is what every caller before GRW-137 meant.
   *
   * Impersonation asks for ten (GRW-136 BR-01), enforced in the database as a
   * CHECK and by the module. This is the third layer, and it is the one that
   * matters to the person typing: a server 400 after they have already
   * committed to the action reads like a bug, where a disabled button with a
   * sentence under it reads like a rule.
   */
  reasonMinLength?: number;
  reasonPlaceholder?: string;
  loading?: boolean;
  /** A failed attempt's message, shown inside the dialog with the typed reason preserved — never surfaced by closing it, which would lose both. */
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  /**
   * A small form the action needs, rendered between the description and the
   * reason field (GRW-131).
   *
   * Deliberately narrow: this is for the one or two inputs an audited action
   * cannot do without — a business id to add an override for — not a general
   * modal slot. A dialog whose whole body is arbitrary is a modal component,
   * and this one's value is that every caller gets the same reason field,
   * the same blank-reason guard and the same error handling.
   */
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
  reasonRequired,
  reasonMinLength = 1,
  reasonPlaceholder = 'Why is this being done?',
  loading,
  error,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  // Clicking Save while the reason is blank used to just do nothing —
  // silently disabled, no visible reason why. Track that it was tried so a
  // real message can render instead of a click that appears to go nowhere.
  const [triedWithoutReason, setTriedWithoutReason] = useState(false);
  // Jira GRW-288 (AC-05) — "Reason *" was a `<label>` pointing at nothing, so
  // the one field every confirm dialog makes mandatory (Impersonate owner,
  // Deactivate, Suspend…) had no name for a screen reader.
  const reasonId = useId();

  /**
   * Clear the reason every time the dialog OPENS.
   *
   * This component early-returns null when closed rather than unmounting, so
   * its state survived being closed and reopened — and several screens serve
   * two different actions from one instance. Suspending a business with
   * "payment failed x3", then later clicking Reactivate, reopened the dialog
   * with that reason already filled in and Confirm already enabled. One
   * unread confirmation and the wrong reason is recorded against a
   * reason-required, audited action, which is the one thing the reason field
   * exists to prevent.
   */
  useEffect(() => {
    if (open) {
      setReason('');
      setTriedWithoutReason(false);
    }
  }, [open]);

  if (!open) return null;

  const reasonMissing = reasonRequired && reason.trim().length < reasonMinLength;

  return (
    <div
      className="admin-dialog-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'oklch(0.2 0.02 155 / 0.5)',
      }}
      // Not while a confirmed action is in flight: dismissing then cleared the
      // host screen's error state, so a request that subsequently FAILED had
      // nowhere to report it and the admin was left believing it had worked.
      onClick={loading ? undefined : onCancel}
    >
      <div
        // Jira GRW-236 — announced as a dialog, named by its title; it was an unnamed div to a screen reader.
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)',
          background: 'white',
          borderRadius: 18,
          boxShadow: '0 24px 60px oklch(0.2 0.04 155 / 0.35)',
          animation: 'admin-fade 0.2s ease',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: danger ? oklch.dangerBg : 'oklch(0.95 0.035 150)',
              color: danger ? oklch.danger : 'oklch(0.44 0.12 150)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Icon name="alert" size={19} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: oklch.textStrong }}>{title}</h3>
            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: oklch.textMuted, lineHeight: 1.5 }}>{description}</p>
          </div>
        </div>

        {children ? <div style={{ marginTop: 16 }}>{children}</div> : null}

        {reasonRequired ? (
          <div style={{ marginTop: 18 }}>
            <label htmlFor={reasonId} style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)', display: 'block', marginBottom: 7 }}>
              Reason <span style={{ color: oklch.danger }}>*</span>
            </label>
            <TextInput
              id={reasonId}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (triedWithoutReason) setTriedWithoutReason(false);
              }}
              placeholder={reasonPlaceholder}
              // Not when the dialog carries a form: the first thing to fill is
              // that form's first field, and stealing focus past it means
              // every caller with children has to fight the dialog for it.
              autoFocus={!children}
            />
            {triedWithoutReason && reasonMissing ? (
              <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 600, color: oklch.danger }}>
                {reason.trim().length === 0
                  ? 'A reason is required before this can be saved.'
                  : `Say a little more — at least ${reasonMinLength} characters.`}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: oklch.danger }}>{error}</div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <SecondaryButton onClick={onCancel} disabled={loading} style={{ flex: 1, height: 44 }}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            onClick={() => {
              if (loading) return;
              if (reasonMissing) {
                setTriedWithoutReason(true);
                return;
              }
              onConfirm(reason.trim());
            }}
            style={{
              flex: 1.2,
              height: 44,
              justifyContent: 'center',
              background: danger ? oklch.danger : oklch.accent,
              opacity: reasonMissing || loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Working…' : confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
