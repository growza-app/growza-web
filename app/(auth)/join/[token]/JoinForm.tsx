'use client';

import { useTranslations } from 'next-intl';
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

export function JoinForm({ token }: { token: string }) {
  const t = useTranslations('auth.join');
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
        const res = await fetch(`/api/v1/team/invites/${encodeURIComponent(token)}/preview`);
        if (cancelled) return;
        if (!res.ok) setInvalid(true);
        else setPreview((await res.json()) as Preview);
      } catch {
        if (!cancelled) setError(t('unreachable'));
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /**
   * Jira GRW-63 · GRW-198 — a password, and nothing else.
   *
   * This screen used to ask for an email address, directly beneath a line
   * saying "You will sign in with that number". The email signed nobody in —
   * it was stored and displayed back — so the form contradicted its own
   * instruction and gave the invitee a field to invent before they could
   * finish.
   */
  const ready = password.length >= 8;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading || !ready) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/team/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
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
          // 409 `belongs_to_another_business` and 401 `existing_account` both
          // arrive here and both keep the form: the invite is still unclaimed
          // in either case, so taking the form away would strand somebody who
          // only needs to try a different number or the right password.
          setError(body?.detail ?? t('couldNotJoin'));
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
      setError(t('unreachable'));
      setPassword('');
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="login-head">
            <h1>{t('checking')}</h1>
          </div>
        </div>
      </main>
    );
  }

  /**
   * The server could not be reached — which is NOT "your invite is invalid".
   * Telling somebody their link is dead when the truth is that we could not ask
   * sends them back to the owner for a replacement that will fail the same way.
   */
  if (error && !preview) {
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="login-head">
            <h1>{t('couldNotCheck')}</h1>
            <p>{error}</p>
          </div>
          <button className="btn login-submit" type="button" onClick={() => window.location.reload()}>
            {t('tryAgain')}
          </button>
        </div>
      </main>
    );
  }

  if (invalid || !preview) {
    return (
      <main className="login-page">
        <div className="login-card">
          <div className="login-head">
            <h1>{t('invalidTitle')}</h1>
            {/*
              AC-03 asks for "a way to ask the owner to resend, not a dead end",
              and the honest way is to say who to ask — NOT a button that does it.
              An unauthenticated "resend this token" route would be an
              enumeration oracle: it would confirm which tokens were once real,
              which is exactly the distinction the preview refuses to draw.
              There is also nothing to address it to — a token that no longer
              resolves names no business.
            */}
            <p>{t('notValid')}</p>
          </div>
          <p className="login-foot" style={{ marginTop: 0 }}>
            {t.rich('askOwner', { b: (chunks) => <strong>{chunks}</strong> })}
          </p>
          {/*
            Sign-in is the SECONDARY path, not the offered action. It is right
            for the one case where a spent link is expected — somebody who
            already joined, or who has an account from another business — and
            useless for everybody else, which is why it is no longer the button.
          */}
          <p className="login-foot">
            {t.rich('alreadyJoined', { signin: (chunks) => <a href="/login">{chunks}</a> })}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-head">
          <h1>{t('title', { business: preview.businessName })}</h1>
          {/* Their own number, shown back to them: it is how they know the
              invite was meant for them and not forwarded from someone else. */}
          <p>{t('setPassword', { phone: preview.phone })}</p>
        </div>

        <div className="field">
          <label htmlFor="join-password">{t('choosePassword')}</label>
          <input
            id="join-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <p className="field-hint">{t('atLeast8')}</p>
        </div>

        {error ? (
          <p className="field-error login-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="btn login-submit" type="submit" disabled={!ready || loading}>
          {loading ? t('joining') : t('joinTeam')}
        </button>

        {/*
          Hidden once there is an error, because the two contradicted each
          other on screen: this line invites them to use their existing
          password, directly under a message explaining that the account they
          already have is the reason they cannot join.
        */}
        {!error && (
          <p className="login-foot">
            {t('haveAccount')}
          </p>
        )}
      </form>
    </main>
  );
}
