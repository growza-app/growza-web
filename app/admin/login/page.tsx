'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AdminApiError } from '../lib/api';
import { writeAdminSession } from '../lib/session';
import { oklch } from '../tokens';
import { Field, PrimaryButton, TextInput } from '../components/primitives';
import { autoFocusField, useAutoFocusField } from '../../shared/a11y/soft-keyboard';
import { CodeField, isTwoStepAnswer, sendCode, SetupSteps } from '../components/TwoStep';

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
  // Rendered in the page's own HTML, so focus comes from the ref after hydration, not from an `autoFocus` the
  // server and the browser would answer differently.
  const phoneRef = useAutoFocusField<HTMLInputElement>();
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
  /**
   * Jira GRW-764 — two-step sign-in, also on this screen. After a right password the API may answer `mfa_code` (type
   * the code from your authenticator) or `mfa_setup` (set one up: QR, then one code). No session exists until the
   * code is right; the half-finished sign-in lives on the server, named by an HttpOnly cookie.
   */
  const [twoStep, setTwoStep] = useState<null | { kind: 'code' } | { kind: 'setup'; secret: string; otpauthUrl: string }>(null);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  function backToPassword(message: string | null) {
    setTwoStep(null);
    setCode('');
    setPassword('');
    setError(message);
  }

  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !twoStep || code.length !== 6) return;
    setLoading(true);
    setError(null);
    const answer = await sendCode(twoStep.kind === 'code' ? 'mfa' : 'mfa/setup', code);
    setLoading(false);
    if (answer.ok) {
      writeAdminSession({ expiresAt: answer.expiresAt ?? new Date(Date.now() + 55 * 60_000).toISOString() });
      router.push('/admin');
      return;
    }
    if (answer.restart) return backToPassword(answer.message);
    setCode('');
    setError(answer.message);
  }

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

      // Jira GRW-764 — the password was right; a code (or setting an authenticator up) comes next.
      if (res.ok && isTwoStepAnswer(body)) {
        setLoading(false);
        if (body.step === 'mfa_code') {
          setTwoStep({ kind: 'code' });
        } else if (body.step === 'mfa_setup') {
          setTwoStep({ kind: 'setup', secret: body.secret, otpauthUrl: body.otpauthUrl });
        } else {
          // First password saved, and two-step sign-in is required: sign in with it, which sets the app up.
          setMustChangePassword(false);
          setPassword('');
          setNewPassword('');
          setNotice(body.detail ?? 'Password saved. Sign in with it to set up your authenticator app.');
        }
        return;
      }

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

  if (twoStep) {
    return (
      <div style={shellStyle}>
        <form onSubmit={onCode} style={cardStyle} aria-label="Two-step sign-in">
          <div style={{ fontWeight: 800, fontSize: '1.125rem', color: oklch.textStrong, marginBottom: 4 }}>
            {twoStep.kind === 'code' ? 'Enter your code' : 'Set up two-step sign-in'}
          </div>
          <p style={{ margin: '0 0 16px', fontSize: '0.8125rem', color: oklch.textMuted, lineHeight: 1.5 }}>
            {twoStep.kind === 'code'
              ? 'Open the authenticator app on your phone and type the 6-digit code for Growza Admin.'
              : 'Two-step sign-in is required for the admin portal. It takes a minute, once.'}
          </p>
          {twoStep.kind === 'setup' ? (
            <div style={{ marginBottom: 16 }}>
              <SetupSteps secret={twoStep.secret} otpauthUrl={twoStep.otpauthUrl} />
            </div>
          ) : null}
          <CodeField value={code} onChange={(next) => { setCode(next); setError(null); }} disabled={loading} focusFirst />
          {error ? <div role="alert" style={{ ...errorStyle, marginTop: 12 }}>{error}</div> : null}
          <PrimaryButton
            type="submit"
            style={{ height: 44, width: '100%', justifyContent: 'center', marginTop: 16, opacity: loading || code.length !== 6 ? 0.7 : 1 }}
          >
            {loading ? 'Checking…' : twoStep.kind === 'code' ? 'Sign in' : 'Turn on and sign in'}
          </PrimaryButton>
          <button
            type="button"
            onClick={() => backToPassword(null)}
            style={{ marginTop: 10, minHeight: 44, width: '100%', border: 'none', background: 'none', color: oklch.textMuted, fontWeight: 600, cursor: 'pointer' }}
          >
            Back to password
          </button>
        </form>
      </div>
    );
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
              fontSize: '1.25rem',
              flex: 'none',
            }}
          >
            G
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.125rem', letterSpacing: '-0.01em', color: oklch.textStrong }}>Growza Admin</div>
            <div style={{ fontSize: '0.78125rem', color: oklch.textMuted }}>
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
              ref={phoneRef}
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
                autoFocus={autoFocusField()}
                required
              />
            </Field>
          ) : null}

          {notice && !error ? (
            <div role="status" style={{ fontSize: '0.8125rem', fontWeight: 600, color: oklch.accentText, background: 'oklch(0.95 0.035 150)', borderRadius: 10, padding: '10px 12px' }}>
              {notice}
            </div>
          ) : null}
          {error ? (
            <div
              style={{
                fontSize: '0.8125rem',
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

const shellStyle: React.CSSProperties = {
  minHeight: '100vh',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: `linear-gradient(180deg, ${oklch.sidebarFrom}, ${oklch.sidebarTo})`,
};

const cardStyle: React.CSSProperties = {
  width: 'min(400px, 100%)',
  background: oklch.surface,
  borderRadius: 20,
  padding: 28,
  boxShadow: '0 24px 60px oklch(0.15 0.04 160 / 0.35)',
};

const errorStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: oklch.danger,
  background: oklch.dangerBg,
  borderRadius: 10,
  padding: '10px 12px',
};
