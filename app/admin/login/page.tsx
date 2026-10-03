'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AdminApiError } from '../lib/api';
import { writeAdminSession } from '../lib/session';
import { oklch } from '../tokens';
import { Field, PrimaryButton, TextInput } from '../components/primitives';

/**
 * GRW-99's login prerequisite. The platform plane signs in by phone number,
 * not email — `POST /api/admin/v1/auth/login` (src/api/admin-routes.ts).
 *
 * Deliberately outside AdminShell: this is the one screen where showing the
 * sidebar/nav would be showing chrome for a portal the visitor cannot use
 * yet. `admin/layout.tsx`'s SessionGate renders this page raw for exactly
 * that reason.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * GRW-165 — the second step, on this same screen and deliberately not a
   * route of its own.
   *
   * An administrator is created by a colleague with a one-time password. When
   * they sign in with it the API answers `password_change_required`, and the
   * form becomes "choose your own" rather than sending them somewhere else:
   * /admin/login is the only address any administrator ever needs.
   */
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        mustChangePassword ? '/api/admin/v1/auth/first-password' : '/api/admin/v1/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            mustChangePassword
              ? { phone: phone.trim(), temporaryPassword: password, newPassword }
              : { phone: phone.trim(), password },
          ),
        },
      );
      const body = (await res.json().catch(() => null)) as { expiresAt?: string; detail?: string; error?: string } | null;

      /*
       * Not a failure: the password was RIGHT and is a one-time one. Swap the
       * form rather than showing an error, and keep `password` — it is the
       * temporary credential the next request has to send.
       */
      if (res.status === 409 && body?.error === 'password_change_required') {
        setMustChangePassword(true);
        setError(null);
        setLoading(false);
        return;
      }

      if (!res.ok || !body?.expiresAt) {
        throw new AdminApiError(res.status, body?.detail ?? body?.error ?? 'Sign-in failed.');
      }
      writeAdminSession({ expiresAt: body.expiresAt });
      router.push('/admin');
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: `linear-gradient(180deg, ${oklch.sidebarFrom}, ${oklch.sidebarTo})`,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: 'min(380px, 100%)',
          background: oklch.surface,
          borderRadius: 20,
          padding: 32,
          boxShadow: '0 24px 60px oklch(0.15 0.04 160 / 0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'oklch(0.95 0.035 150)',
              color: oklch.accentText,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 20,
              flex: 'none',
            }}
          >
            G
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em', color: oklch.textStrong }}>Growza Admin</div>
            <div style={{ fontSize: 12.5, color: oklch.textMuted }}>
              {mustChangePassword ? 'Choose your own password to finish' : 'Platform team sign-in'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Phone number">
            <TextInput
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
              required
            />
          </Field>
          <Field label={mustChangePassword ? 'One-time password' : 'Password'}>
            <TextInput
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          {mustChangePassword ? (
            <Field label="Choose a new password">
              <TextInput
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
                required
              />
            </Field>
          ) : null}

          {error ? (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: oklch.danger,
                background: oklch.dangerBg,
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              {error}
            </div>
          ) : null}

          <PrimaryButton type="submit" style={{ height: 44, justifyContent: 'center', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Signing in…' : mustChangePassword ? 'Set password and sign in' : 'Sign in'}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
