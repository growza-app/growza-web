'use client';

import { useState } from 'react';
import { PhoneField } from '../../(tenant)/components/PhoneField';
import { toStoredPhone } from '../../(tenant)/lib/phone';

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
  /**
   * Jira GRW-233 — a newly enrolled owner signs in with the one-time password
   * Growza gave them, and the API answers 409 `password_change_required`. The
   * card then asks for their own password (twice) and posts it with the
   * one-time one to /auth/first-password, which signs them in.
   */
  const [temporary, setTemporary] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const ready = toStoredPhone(phone) !== null && password.length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading || !ready) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /*
         * GRW-199 — the field holds ten NATIONAL digits; the API matches on the
         * stored `+91…` form. Sending `phone.trim()` sent "9876500001" against
         * an account stored as "+919876500001" and the sign-in simply said the
         * number or password was wrong.
         *
         * Caught by the device sweep's setup, which signs in for real. Every
         * one of the 154 viewport tests depends on this one request.
         */
        body: JSON.stringify({ phone: toStoredPhone(phone) ?? phone.trim(), password }),
      });

      if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (body?.error === 'password_change_required') {
          setTemporary(password);
          setPassword('');
          setLoading(false);
          return;
        }
      }
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

  async function onChoosePassword(event: React.FormEvent) {
    event.preventDefault();
    if (loading || temporary === null) return;
    if (newPassword.length < 8) {
      setError('Choose a password of at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/first-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: toStoredPhone(phone) ?? phone.trim(), temporaryPassword: temporary, newPassword }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string; error?: string } | null;
        setError(body?.detail ?? 'Could not set your password. Please try again.');
        // A refused one-time password cannot be retried from here; start again.
        if (body?.error === 'invalid_credentials') setTemporary(null);
        setLoading(false);
        return;
      }
      window.location.replace('/');
    } catch {
      setError('Could not reach the server. Please check your connection and try again.');
      setLoading(false);
    }
  }

  if (temporary !== null) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={onChoosePassword}>
          <div className="login-head">
            <h1>Choose your password</h1>
            <p>You signed in with a one-time password. Pick your own to finish — at least 8 characters.</p>
          </div>

          <div className="field">
            <label htmlFor="login-new-password">New password</label>
            <input
              id="login-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setError(null);
              }}
              disabled={loading}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="login-confirm-password">Type it again</label>
            <input
              id="login-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError(null);
              }}
              disabled={loading}
            />
          </div>

          {error ? (
            <p className="field-error login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="btn login-submit" type="submit" disabled={loading || !newPassword || !confirm}>
            {loading ? 'Saving…' : 'Save and sign in'}
          </button>

          <button
            type="button"
            className="login-back"
            onClick={() => {
              setTemporary(null);
              setNewPassword('');
              setConfirm('');
              setError(null);
            }}
          >
            Use a different number
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-head">
          <h1>Sign in</h1>
          <p>Manage your bookings, staff and services.</p>
        </div>

        {/* GRW-199 — the same field as everywhere else. Signing in with a
            number typed one way and stored another is the login half of the
            duplicate-client problem: the account is found by exact match. */}
        <PhoneField
          id="login-phone"
          label="Phone number"
          required
          value={phone}
          onChange={setPhone}
          disabled={loading}
        />

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
