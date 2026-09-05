'use client';

import { useState } from 'react';

/**
 * Jira GRW-66 · GRW-160 — where a salon owner signs in.
 *
 * Posts to `/api/v1/auth/login` (GRW-159) **same-origin**, through Next's
 * `/api/:path*` rewrite. That detail is the whole reason this works: the
 * browser sees the response as coming from the dashboard's own origin, so the
 * `Set-Cookie` is stored against it. Calling the API's port directly would set
 * the cookie on a different origin and the dashboard would never send it.
 *
 * The token is never touched here. It arrives as an `HttpOnly` cookie the
 * browser attaches by itself (BR-02) — unlike the admin plane, which keeps its
 * token in `sessionStorage` because every admin page is a client component.
 */
export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = phone.trim().length > 0 && password.length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading || !ready) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), password }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string; error?: string } | null;
        // BR-04 — the API's own words. It answers generically on purpose
        // (GRW-159 FR-02) and rewording it here is how a leak gets put back.
        setError(body?.detail ?? body?.error ?? 'Sign-in failed. Please try again.');
        setPassword('');
        setLoading(false);
        return;
      }

      /**
       * A full page load, deliberately, and NOT `router.refresh()` then
       * `router.push()` — those two race, and the refresh wins (the same bug
       * this cost us on sign-out). The dashboard's pages are server-rendered
       * and Next may be holding renders made before this cookie existed;
       * `location.assign` guarantees none of them survive, where `refresh()`
       * only tries to.
       *
       * `replace`, so the sign-in screen leaves the history: pressing Back
       * from the dashboard should take an owner out of the app, not show them
       * a login form for the session they are already inside.
       */
      window.location.replace('/');
    } catch {
      setError('Could not reach the server. Please check your connection and try again.');
      setPassword('');
      setLoading(false);
    }
    /**
     * No `finally { setLoading(false) }`. On the success path the browser is
     * already navigating away, and re-enabling the form in the meantime just
     * offers a second submit of credentials that have already been accepted.
     * Each path that STAYS on this page clears it for itself.
     */
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-head">
          <h1>Sign in</h1>
          <p>Manage your bookings, staff and services.</p>
        </div>

        <div className="field">
          <label htmlFor="login-phone">Phone number</label>
          <input
            id="login-phone"
            name="phone"
            type="tel"
            autoComplete="username"
            inputMode="tel"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* `role="alert"` so a screen reader announces a failed sign-in, which
            is otherwise a silent change three fields away from the focus. */}
        {error ? (
          <p className="field-error login-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="btn login-submit" type="submit" disabled={!ready || loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="login-foot">Forgotten your password? Ask whoever set up your account.</p>
      </form>
    </main>
  );
}
