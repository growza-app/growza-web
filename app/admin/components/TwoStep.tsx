'use client';

import { useMemo, useRef, useState } from 'react';
import { encodeQr } from '../../(tenant)/lib/print/qr';
import { oklch } from '../tokens';
import { useDialog } from '../../shared/a11y/useDialog';
import { autoFocusField } from '../../shared/a11y/soft-keyboard';

/**
 * Jira GRW-764 — two-step sign-in for the admin portal: the 6-digit code field, the "set up your authenticator"
 * card (QR + the key as text), and the dialog an already-signed-in admin uses to turn it on.
 *
 * The QR is drawn here from our own encoder (the one receipts use), as one SVG path — no image request, no library,
 * and the secret never leaves this page (BR-03). The admin portal is English-only today, like every other admin
 * screen; the plain words are the point.
 */

export function QrSvg({ text, size = 184 }: { text: string; size?: number }) {
  const qr = useMemo(() => encodeQr(text), [text]);
  const quiet = 4;
  const span = qr.size + quiet * 2;
  let d = '';
  qr.modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }),
  );
  return (
    <svg
      role="img"
      aria-label="QR code to scan with your authenticator app"
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      shapeRendering="crispEdges"
      style={{ display: 'block', background: 'white', borderRadius: 8 }}
    >
      <path d={d} fill="black" />
    </svg>
  );
}

/** Six digits, the phone's number pad, and the "from Messages / Authenticator" autofill where the OS offers it. */
export function CodeField({
  value,
  onChange,
  disabled,
  focusFirst,
  id = 'two-step-code',
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  focusFirst?: boolean;
  id?: string;
}) {
  return (
    <label htmlFor={id} style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: oklch.textMuted }}>
      6-digit code
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={value}
        disabled={disabled}
        // Focus belongs here the moment this step appears — except where that would throw a keyboard over the QR.
        autoFocus={autoFocusField(Boolean(focusFirst))}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        style={{
          display: 'block',
          width: '100%',
          marginTop: 6,
          height: 48,
          padding: '0 12px',
          borderRadius: 10,
          border: `1px solid ${oklch.borderStrong}`,
          // 1rem (16px): the size that stops iOS zooming the page when the field takes focus (CLAUDE.md UI rules).
          fontSize: '1rem',
          letterSpacing: '0.35em',
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'center',
        }}
      />
    </label>
  );
}

/** The key in groups of four, for typing into an app when the camera cannot read the QR. */
export function KeyBlock({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  const grouped = secret.replace(/(.{4})/g, '$1 ').trim();
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: '0.75rem', color: oklch.textMuted }}>Can&rsquo;t scan? Type this key into the app:</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <code
          style={{
            flex: 1,
            minWidth: 0,
            padding: '8px 10px',
            borderRadius: 8,
            background: oklch.surfaceSubtle,
            border: `1px solid ${oklch.border}`,
            fontSize: '0.8125rem',
            overflowWrap: 'anywhere',
          }}
        >
          {grouped}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(secret).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
          style={{ minHeight: 44, padding: '0 12px', borderRadius: 9, border: `1px solid ${oklch.border}`, background: 'white', cursor: 'pointer', fontWeight: 600 }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/** The set-up steps, in the order the person does them. */
export function SetupSteps({ secret, otpauthUrl }: { secret: string; otpauthUrl: string }) {
  return (
    <div>
      <ol style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: '0.8125rem', lineHeight: 1.5, color: oklch.textStrong }}>
        <li>Open an authenticator app on your phone — Google Authenticator or Microsoft Authenticator.</li>
        <li>Add an account and scan this code.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <QrSvg text={otpauthUrl} />
      </div>
      <KeyBlock secret={secret} />
    </div>
  );
}

/** What the API's two-step answers mean on screen. */
export type TwoStepAnswer = { step: 'mfa_code' } | { step: 'mfa_setup'; secret: string; otpauthUrl: string } | { step: 'sign_in'; detail?: string };

export function isTwoStepAnswer(body: unknown): body is TwoStepAnswer {
  const step = (body as { step?: unknown } | null)?.step;
  return step === 'mfa_code' || step === 'mfa_setup' || step === 'sign_in';
}

/** POST one code to the code route or the set-up route: signed in (with the session's end), or the API's own sentence. */
export async function sendCode(
  path: 'mfa' | 'mfa/setup',
  code: string,
): Promise<{ ok: true; expiresAt: string | null } | { ok: false; message: string; restart: boolean }> {
  try {
    const res = await fetch(`/api/admin/v1/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string; detail?: string; expiresAt?: string } | null;
    if (res.ok) return { ok: true, expiresAt: body?.expiresAt ?? null };
    return { ok: false, message: body?.detail ?? 'That did not work. Try again.', restart: body?.error === 'mfa_expired' };
  } catch {
    return { ok: false, message: 'Could not reach the server. Try again.', restart: false };
  }
}

/**
 * Jira GRW-764 (FR-04) — "Turn on two-step sign-in" for an admin who is signed in with a password only. Proving the
 * password again is what lets the API set an authenticator up (it needs a fresh access token), so the dialog asks for
 * it, then shows the QR, then one code. Success reloads the portal on the new session.
 */
export function TwoStepEnrolDialog({ phone, onClose }: { phone: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose: busy ? undefined : onClose });

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password, enrol: true }),
      });
      const body = (await res.json().catch(() => null)) as unknown;
      const answer = res.ok && isTwoStepAnswer(body) ? body : null;
      if (answer?.step === 'mfa_setup') {
        setSetup({ secret: answer.secret, otpauthUrl: answer.otpauthUrl });
      } else if (answer?.step === 'mfa_code') {
        setDone('Two-step sign-in is already on for your account.');
      } else {
        setError((body as { detail?: string } | null)?.detail ?? 'That password did not work.');
      }
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const answer = await sendCode('mfa/setup', code);
    setBusy(false);
    if (answer.ok) {
      setDone('Two-step sign-in is on. From now on you will type a code from the app after your password.');
      return;
    }
    setError(answer.message);
    if (answer.restart) {
      setSetup(null);
      setCode('');
    }
  }

  const primary: React.CSSProperties = {
    minHeight: 44,
    padding: '0 16px',
    borderRadius: 9,
    border: 'none',
    background: oklch.accent,
    color: 'white',
    fontWeight: 700,
    cursor: 'pointer',
  };

  return (
    <>
      <div onClick={busy ? undefined : onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 250 / 0.4)', zIndex: 200 }} />
      <div
        role="dialog"
        aria-modal="true"
        ref={ref}
        aria-label="Turn on two-step sign-in"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 201,
          width: 'min(400px, calc(100vw - 32px))',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          background: 'white',
          borderRadius: 14,
          border: `1px solid ${oklch.border}`,
          boxShadow: '0 20px 50px oklch(0.3 0.02 250 / 0.22)',
          padding: 20,
        }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: '1.0625rem', fontWeight: 800 }}>Turn on two-step sign-in</h2>
        <p style={{ margin: '0 0 14px', fontSize: '0.8125rem', color: oklch.textMuted }}>
          After your password, you will also type a code from an app on your phone. A stolen password alone will not get in.
        </p>
        {done ? (
          <>
            <p style={{ margin: '0 0 16px', fontSize: '0.875rem', fontWeight: 600, color: oklch.accent }}>{done}</p>
            <button type="button" style={primary} onClick={() => window.location.reload()}>
              Done
            </button>
          </>
        ) : setup ? (
          <>
            <SetupSteps secret={setup.secret} otpauthUrl={setup.otpauthUrl} />
            <div style={{ marginTop: 14 }}>
              <CodeField value={code} onChange={setCode} disabled={busy} focusFirst />
            </div>
            {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: '0.8125rem', color: oklch.danger }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" style={{ ...primary, opacity: code.length === 6 && !busy ? 1 : 0.6 }} disabled={busy || code.length !== 6} onClick={() => void finish()}>
                {busy ? 'Checking…' : 'Turn on'}
              </button>
              <button type="button" disabled={busy} onClick={onClose} style={{ minHeight: 44, padding: '0 16px', borderRadius: 9, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: oklch.textMuted }}>
              Your password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={busy}
                autoFocus={autoFocusField()}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                style={{ display: 'block', width: '100%', marginTop: 6, height: 44, padding: '0 10px', borderRadius: 9, border: `1px solid ${oklch.border}`, fontSize: '1rem' }}
              />
            </label>
            {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: '0.8125rem', color: oklch.danger }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" style={{ ...primary, opacity: password && !busy ? 1 : 0.6 }} disabled={busy || !password} onClick={() => void start()}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
              <button type="button" disabled={busy} onClick={onClose} style={{ minHeight: 44, padding: '0 16px', borderRadius: 9, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
