'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { oklch } from '../tokens';
import { FieldLabel, PrimaryButton, SecondaryButton, TextInput } from '../components/primitives';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * GRW-133 — adding a platform administrator. GRW-165 — with a password.
 *
 * This form used to ask for the **auth subject**: Growza records who may
 * administer and the identity provider owns the credential (ADR-14), so the
 * subject was something an admin pasted in. That is a correct description of
 * the architecture and it left the field unfillable — nothing in the product
 * created the provider user, so there was no subject to paste, and a role
 * created here could be assigned to nobody who could actually log in.
 *
 * Growza now creates the provider user, so the subject comes back FROM the
 * provider. What a colleague supplies instead is a starting password they can
 * say out loud — and it is one-time: the new administrator must replace it the
 * first time they sign in, so the person who set it cannot go on using it.
 */
export interface RoleOption {
  id: string;
  name: string;
  isBuiltin: boolean;
  /** Every permission the role grants — all of them for the built-in role. The API always sent it; batch D reads it. */
  permissions: string[];
}

const REQUEST_TIMEOUT_MS = 30_000;

export function AddAdminModal({
  open,
  roles,
  onClose,
  onAdded,
}: {
  open: boolean;
  roles: RoleOption[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose: saving ? undefined : onClose });
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    setName('');
    setPhone('');
    setPassword('');
    // Never defaults to the built-in role: giving somebody full administration
    // should be a choice, not what happens when nobody chose.
    setRoleId('');
    setReason('');
    setError(null);
  }, [open]);

  if (!open) return null;

  const blocker =
    name.trim() === ''
      ? 'Enter their name.'
      : phone.trim() === ''
          ? 'Enter the mobile number they will sign in with.'
          : password.length < 8
            ? 'Choose a starting password of at least 8 characters.'
          : roleId === ''
            ? 'Choose a role.'
            : reason.trim() === ''
              ? 'Enter a reason — it is recorded against your name.'
              : null;

  function save() {
    setSaving(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    adminFetch<unknown>('/users', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim(),
        password,
        roleId,
        reason: reason.trim(),
      }),
    })
      .then(() => {
        onAdded();
        onClose();
      })
      .catch((err) =>
        setError(
          err instanceof AdminApiError
            ? err.message
            : controller.signal.aborted
              ? 'That took too long to answer. Check the list before trying again.'
              : 'Could not add this administrator.',
        ),
      )
      .finally(() => {
        clearTimeout(timer);
        setSaving(false);
      });
  }

  return (
    <div
      className="admin-dialog-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'oklch(0.2 0.02 155 / 0.5)',
      }}
      onClick={saving ? undefined : onClose}
    >
      <div
        role="dialog"
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'white',
          borderRadius: 18,
          boxShadow: '0 24px 60px oklch(0.2 0.04 155 / 0.35)',
          animation: 'admin-fade 0.2s ease',
        }}
      >
        <div style={{ padding: '22px 24px 0' }}>
          <h3 id={`${ids}-title`} style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', color: oklch.textStrong }}>
            Add an administrator
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: oklch.textMuted }}>They can administer Growza itself — never a single business.</p>
        </div>

        <div style={{ padding: '18px 24px 24px', display: 'grid', gap: 14 }}>
          <div>
            <FieldLabel htmlFor={`${ids}-name`}>Name</FieldLabel>
            <TextInput id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" disabled={saving} />
          </div>
          <div>
            <FieldLabel htmlFor={`${ids}-phone`}>Mobile number</FieldLabel>
            <TextInput id={`${ids}-phone`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" disabled={saving} />
          </div>
          <div>
            <FieldLabel htmlFor={`${ids}-password`}>Starting password</FieldLabel>
            <TextInput
              id={`${ids}-password`}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
            />
            <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600, marginTop: 5 }}>
              Tell them this password. They must replace it the first time they sign in, so it stops working for you
              straight away.
            </div>
          </div>
          <div>
            <FieldLabel htmlFor={`${ids}-role`}>Role</FieldLabel>
            <select
              id={`${ids}-role`}
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={saving}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${oklch.borderStrong}`, fontSize: 14, fontWeight: 600 }}
            >
              <option value="">Choose a role…</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                  {role.isBuiltin ? ' — every permission' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor={`${ids}-reason`}>Reason</FieldLabel>
            <TextInput id={`${ids}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why they need access" disabled={saving} />
          </div>

          {error ? <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.5 0.18 25)' }}>{error}</div> : null}
          {blocker ? <div style={{ fontSize: 12.5, color: oklch.textMuted, fontWeight: 600 }}>{blocker}</div> : null}

          <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
            <SecondaryButton onClick={onClose} disabled={saving}>
              Close
            </SecondaryButton>
            <PrimaryButton onClick={save} disabled={blocker !== null || saving}>
              {saving ? 'Adding…' : 'Add administrator'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
