'use client';

import { useState, useRef } from 'react';
import { adminFetch } from '../lib/api';
import { oklch } from '../tokens';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Jira GRW-88 · GRW-202 — an administrator changes their own password.
 *
 * Session-only on the API: it needs no permission, because gating it on
 * `admin.user.manage` would deny it to precisely the people who most need it —
 * a Support administrator has the fewest permissions and the same right to
 * their own credential.
 */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose: busy ? undefined : onClose });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setDone(true);
      setCurrent('');
      setNext('');
    } catch (err) {
      // The API's own sentence: it separates a wrong current password from one
      // the pool refused, and those need different things from the reader.
      setError(err instanceof Error ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = {
    width: '100%',
    padding: '9px 10px',
    fontSize: 14,
    borderRadius: 9,
    border: `1px solid ${oklch.border}`,
    marginTop: 4,
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 250 / 0.4)', zIndex: 200 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        aria-label="Change your password"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 201,
          width: 'min(380px, calc(100vw - 32px))',
          background: 'white',
          borderRadius: 14,
          border: `1px solid ${oklch.border}`,
          boxShadow: '0 20px 50px oklch(0.3 0.02 250 / 0.22)',
          padding: 20,
        }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>Change your password</h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: oklch.textMuted }}>
          You sign in with your phone number. This only changes the password.
        </p>

        {done ? (
          <>
            <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: oklch.accent }}>
              Password changed. Use the new one next time you sign in.
            </p>
            <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: 9, cursor: 'pointer' }}>
              Close
            </button>
          </>
        ) : (
          <>
            <label style={{ fontSize: 12, fontWeight: 600, color: oklch.textMuted }}>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                disabled={busy}
                style={field}
                onChange={(e) => {
                  setCurrent(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600, color: oklch.textMuted, display: 'block', marginTop: 12 }}>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                disabled={busy}
                style={field}
                onChange={(e) => {
                  setNext(e.target.value);
                  setError(null);
                }}
              />
            </label>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: oklch.textMuted }}>At least 8 characters.</p>
            {error && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#c0362c' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                disabled={busy || current.length === 0 || next.length < 8}
                onClick={() => void submit()}
                style={{
                  padding: '9px 16px',
                  borderRadius: 9,
                  border: 'none',
                  background: oklch.accent,
                  color: oklch.accentText,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {busy ? 'Saving…' : 'Change password'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                style={{ padding: '9px 16px', borderRadius: 9, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
