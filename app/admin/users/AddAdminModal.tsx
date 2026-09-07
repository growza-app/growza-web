'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { oklch } from '../tokens';
import { PrimaryButton, SecondaryButton, TextInput } from '../components/primitives';

/**
 * GRW-133 — adding a platform administrator. GRW-164 — by inviting them.
 *
 * This form used to ask for the **auth subject**: Growza records who may
 * administer and the identity provider owns the credential (ADR-14), so the
 * subject was something an admin pasted in. That is a correct description of
 * the architecture and it left the field unfillable — nothing in the product
 * created the provider user, so there was no subject to paste, and a role
 * created here could be assigned to nobody who could actually log in.
 *
 * The subject is now produced by ACCEPTING an invitation, which is the
 * product's job rather than a human's. What is asked for instead is the phone
 * number they will sign in with.
 */
export interface RoleOption {
  id: string;
  name: string;
  isBuiltin: boolean;
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
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  /** The link, once. There is no route that returns it again — only its hash is stored. */
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
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
    setEmail('');
    setPhone('');
    // The link is cleared with everything else: it is shown once, and a stale
    // one still on screen when the modal reopens would be a link to somebody
    // else's invitation.
    setLink(null);
    setCopied(false);
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
      : email.trim() === ''
        ? 'Enter their email.'
        : phone.trim() === ''
          ? 'Enter the mobile number they will sign in with.'
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
    adminFetch<{ token: string }>('/invites', {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        roleId,
        reason: reason.trim(),
      }),
    })
      .then((created) => {
        // Shown, not sent — there is no outbound path yet (GRW-165), and the
        // modal STAYS OPEN because this is the only time the link exists.
        setLink(`${window.location.origin}/admin/join/${created.token}`);
        onAdded();
      })
      .catch((err) =>
        setError(
          err instanceof AdminApiError
            ? err.message
            : controller.signal.aborted
              ? 'That took too long to answer. Check the list before trying again.'
              : 'Could not create this invitation.',
        ),
      )
      .finally(() => {
        clearTimeout(timer);
        setSaving(false);
      });
  }

  const label = (text: string) => (
    <div style={{ fontSize: 12, fontWeight: 800, color: oklch.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{text}</div>
  );

  return (
    <div
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
            Invite an administrator
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: oklch.textMuted }}>They can administer Growza itself — never a single business.</p>
        </div>

        <div style={{ padding: '18px 24px 24px', display: 'grid', gap: 14 }}>
          <div>
            {label('Name')}
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" disabled={saving} />
          </div>
          <div>
            {label('Email')}
            <TextInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@growza.app" disabled={saving} />
          </div>
          <div>
            {label('Mobile number')}
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" disabled={saving} />
            <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600, marginTop: 5 }}>
              They sign in with this number and a password they choose themselves.
            </div>
          </div>
          <div>
            {label('Role')}
            <select
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
            {label('Reason')}
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why they need access" disabled={saving} />
          </div>

          {error ? <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.5 0.18 25)' }}>{error}</div> : null}
          {!link && blocker ? <div style={{ fontSize: 12.5, color: oklch.textMuted, fontWeight: 600 }}>{blocker}</div> : null}

          {/*
            The link, and the one thing about it that cannot be undone by
            coming back to this screen: only its hash is stored, so this is the
            only time it exists. Said plainly, and the modal does not close
            itself — an invitation that vanished on save would have to be
            reissued.
          */}
          {link ? (
            <div
              style={{
                background: oklch.surfaceSubtle,
                border: `1px solid ${oklch.borderStrong}`,
                borderRadius: 12,
                padding: 14,
                display: 'grid',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 700, color: oklch.textStrong }}>Invitation ready</div>
              <div style={{ fontSize: 12.5, color: oklch.textMuted, fontWeight: 600, lineHeight: 1.45 }}>
                Send this link to {name.trim() || 'them'}. It works once, expires in 48 hours, and is shown only now — we do
                not keep a copy.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <TextInput value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
                <SecondaryButton
                  onClick={() => {
                    void navigator.clipboard?.writeText(link);
                    setCopied(true);
                  }}
                >
                  {copied ? 'Copied' : 'Copy link'}
                </SecondaryButton>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end' }}>
            <SecondaryButton onClick={onClose} disabled={saving}>
              {link ? 'Done' : 'Close'}
            </SecondaryButton>
            {link ? null : (
              <PrimaryButton onClick={save} disabled={blocker !== null || saving}>
                {saving ? 'Creating…' : 'Create invite'}
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
