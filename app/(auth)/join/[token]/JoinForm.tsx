'use client';

import { useEffect, useState } from 'react';

/**
 * Jira GRW-63 · GRW-67 — the invitee's first and only sign-up screen.
 *
 * Two states before the form: checking, and "this link is no longer valid".
 * The second is the SAME message for expired, cancelled, already-used and
 * never-existed, because the API gives one answer for all four on purpose —
 * restating a distinction here would put back the enumeration the API refuses
 * to offer.
 */
interface Preview {
  businessName: string;
  phone: string;
}

const UNREACHABLE = 'Could not reach the server. Please check your connection and try again.';
const NOT_VALID = 'This invite link is no longer valid. Ask whoever invited you to send a new one.';

export function JoinForm({ token }: { token: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/team/invites/${encodeURIComponent(token)}/preview`);
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

  const ready = email.trim().length > 0 && password.length >= 8;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading || !ready) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/team/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: email.trim(), password }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        // 404 here means the invite went stale while they were typing — the
        // form is no use to them any more, so take it away rather than let
        // them keep submitting into it.
        if (res.status === 404) {
          setInvalid(true);
          setPreview(null);
        } else {
          setError(body?.detail ?? 'Could not join. Please try again.');
          setPassword('');
        }
        setLoading(false);
        return;
      }

      /**
       * Accepting signs them in — the API sets the session cookie — so go
       * straight to the dashboard rather than to a login form for the account
       * they just created. A full page load for the same reason `/login` uses
       * one: server-rendered pages may be held from before this cookie
       * existed, and `replace` keeps a spent invite link out of history.
       */
      window.location.replace('/');
    } catch {
      setError(UNREACHABLE);
      setPassword('');
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="login-head">
            <h1>Checking your invite…</h1>
          </div>
        </div>
      </main>
    );
  }

  if (invalid || !preview) {
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="login-head">
            <h1>Invite not valid</h1>
            <p>{error ?? NOT_VALID}</p>
          </div>
          <a className="btn login-submit" href="/login">
            Go to sign in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-head">
          <h1>Join {preview.businessName}</h1>
          {/* Their own number, shown back to them: it is how they know the
              invite was meant for them and not forwarded from someone else. */}
          <p>Set a password for {preview.phone}. You will sign in with that number.</p>
        </div>

        <div className="field">
          <label htmlFor="join-email">Email address</label>
          <input
            id="join-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="field">
          <label htmlFor="join-password">Choose a password</label>
          <input
            id="join-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <p className="field-hint">At least 8 characters.</p>
        </div>

        {error ? (
          <p className="field-error login-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="btn login-submit" type="submit" disabled={!ready || loading}>
          {loading ? 'Joining…' : 'Join team'}
        </button>

        <p className="login-foot">
          Already have a Growza account for this number? Enter its password above to join this team with it.
        </p>
      </form>
    </main>
  );
}
