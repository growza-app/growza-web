'use client';

import { useState } from 'react';
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
  reasonPlaceholder?: string;
  loading?: boolean;
  /** A failed attempt's message, shown inside the dialog with the typed reason preserved — never surfaced by closing it, which would lose both. */
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
  reasonRequired,
  reasonPlaceholder = 'Why is this being done?',
  loading,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  if (!open) return null;

  const reasonMissing = reasonRequired && reason.trim().length === 0;

  return (
    <div
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
      onClick={onCancel}
    >
      <div
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

        {reasonRequired ? (
          <div style={{ marginTop: 18 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: 'oklch(0.45 0.02 155)', display: 'block', marginBottom: 7 }}>
              Reason <span style={{ color: oklch.danger }}>*</span>
            </label>
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder={reasonPlaceholder} autoFocus />
          </div>
        ) : null}

        {error ? (
          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600, color: oklch.danger }}>{error}</div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <SecondaryButton onClick={onCancel} style={{ flex: 1, height: 44 }}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            onClick={() => {
              if (reasonMissing || loading) return;
              onConfirm(reason.trim());
            }}
            style={{
              flex: 1.2,
              height: 44,
              justifyContent: 'center',
              background: danger ? oklch.danger : oklch.accent,
              opacity: reasonMissing || loading ? 0.6 : 1,
              cursor: reasonMissing || loading ? 'not-allowed' : 'pointer',
              pointerEvents: reasonMissing || loading ? 'none' : 'auto',
            }}
          >
            {loading ? 'Working…' : confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
