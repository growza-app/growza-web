'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { oklch } from '../../tokens';
import { Field, PrimaryButton, TextInput } from '../../components/primitives';

/**
 * Jira GRW-164 — the invited administrator's first and only sign-up screen.
 *
 * Two states before the form: checking, and "this link is no longer valid" —
 * the SAME message for expired, revoked, already-used and never-existed,
 * because the API gives one answer for all four on purpose. Restating a
 * distinction here would put back the enumeration the API refuses to offer.
 *
 * No session is written on success. The admin plane keeps its token in
 * `sessionStorage` and the accept route deliberately does not issue one, so
 * this hands over to /admin/login with the password they just chose — one
 * screen, and this form never has to know how admin sessions are stored.
 */
interface Preview {
  name: string;
  phone: string;
  roleName: string;
}

const UNREACHABLE = 'Could not reach the server. Please check your connection and try again.';
const NOT_VALID = 'Invitations expire after 48 hours, and stop working once used. Ask whoever invited you for a new one.';

export function JoinAdminForm({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/v1/invites/${encodeURIComponent(token)}/preview`);
        if (cancelled) return;
        if (!res.ok) setInvalid(true);
        else setPreview((await res.json()) as Preview);
      } catch {
        if (!cancelled) setError(UNREACHABLE);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const ready = password.length >= 8;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading || !ready) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/v1/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        // 404 means the invitation went stale while they were typing — the
        // form is no use to them now, so take it away rather than let them
        // keep submitting into it.
        if (res.status === 404) {
          setInvalid(true);
          setPreview(null);
        } else {
          setError(body?.detail ?? 'Could not complete your sign-up. Please try again.');
          setPassword('');
        }
        setLoading(false);
        return;
      }
      router.replace('/admin/login');
    } catch {
      setError(UNREACHABLE);
      setPassword('');
      setLoading(false);
    }
  }

  const card = (children: React.ReactNode) => (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: `linear-gradient(180deg, ${oklch.sidebarFrom}, ${oklch.sidebarTo})`,
      }}
    >
      <div
        style={{
          width: 'min(380px, 100%)',
          background: oklch.surface,
          borderRadius: 20,
          padding: 32,
          boxShadow: '0 24px 60px oklch(0.15 0.04 160 / 0.35)',
        }}
      >
        {children}
      </div>
    </main>
  );

  const heading = (title: string, sub: string) => (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.01em', color: oklch.textStrong }}>{title}</div>
      <div style={{ fontSize: 13, color: oklch.textMuted, marginTop: 4, lineHeight: 1.45 }}>{sub}</div>
    </div>
  );

  if (checking) return card(heading('Checking your invitation…', 'One moment.'));

  /**
   * Could not reach the server, which is NOT "your invitation is invalid".
   * Telling somebody their link is dead when the truth is that we could not
   * ask sends them back for a replacement that will fail the same way.
   */
  if (error && !preview) {
    return card(
      <>
        {heading('Could not check your invitation', error)}
        <PrimaryButton onClick={() => window.location.reload()}>Try again</PrimaryButton>
      </>,
    );
  }

  if (invalid || !preview) {
    return card(
      <>
        {heading('This link no longer works', NOT_VALID)}
        <div style={{ fontSize: 12.5, color: oklch.textMuted, fontWeight: 600 }}>
          They can send you a new one from <strong>Users → Invite an administrator</strong>.
        </div>
      </>,
    );
  }

  return card(
    <form onSubmit={onSubmit}>
      {heading(
        `Join the Growza platform team`,
        `You have been invited as ${preview.roleName}. Choose a password for ${preview.phone} — that number and this password are how you will sign in.`,
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Choose a password">
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoFocus
            required
          />
        </Field>
        <div style={{ fontSize: 12, color: oklch.textFaint, fontWeight: 600, marginTop: -8 }}>At least 8 characters.</div>

        {error ? (
          <div role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.5 0.18 25)' }}>
            {error}
          </div>
        ) : null}

        <PrimaryButton type="submit" disabled={!ready || loading}>
          {loading ? 'Setting up…' : 'Create my account'}
        </PrimaryButton>
      </div>
    </form>,
  );
}
