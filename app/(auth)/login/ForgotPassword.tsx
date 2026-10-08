'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PhoneField } from '../../(tenant)/components/PhoneField';
import { toStoredPhone } from '../../(tenant)/lib/phone';
import { confirmReset, requestCode, signInAfterReset } from './forgot-flow';

/**
 * Jira GRW-561 — a person who has forgotten their password gets a code on their phone and chooses a new one.
 *
 * Three screens on the same sign-in card, in the same classes as the form beside it:
 *
 *   phone   →   code   →   (signed in)
 *                 ↘ locked   three wrong codes: "please call us", with the number tappable
 *
 * **Nothing here says whether a text was sent.** The API answers the same for a number it knows and one it does not,
 * on purpose (it is how a stranger could otherwise learn who uses Growza), so the words on the code screen are
 * "if that number has an account" — true either way. A person who never gets a code is not stuck: "send again" is
 * there, and three wrong tries ends at the support number.
 *
 * The locked screen is worded here, not taken from the API's sentence, because it has to carry a number the person
 * can tap, and a sentence from the API is plain text.
 */
const RESEND_AFTER_SECONDS = 30;

type Step = 'phone' | 'code' | 'locked';

export default function ForgotPassword({ initialPhone, onBack }: { initialPhone: string; onBack: () => void }) {
  const t = useTranslations('auth.forgotPassword');
  const tl = useTranslations('auth.login');
  const locale = useLocale();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportPhone, setSupportPhone] = useState<string | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);

  const stored = toStoredPhone(phone);

  // One tick a second while there is something to count down; nothing at all otherwise.
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const id = setTimeout(() => setWaitSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [waitSeconds]);

  function lock(phoneNumber: string | null) {
    setSupportPhone(phoneNumber);
    setStep('locked');
    setError(null);
  }

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (busy || stored === null) return;
    setBusy(true);
    setError(null);
    const outcome = await requestCode(stored, locale);
    setBusy(false);
    if (outcome.kind === 'sent') {
      setStep('code');
      setWaitSeconds(RESEND_AFTER_SECONDS);
    } else if (outcome.kind === 'locked') lock(outcome.supportPhone);
    else if (outcome.kind === 'unreachable') setError(tl('errors.unreachable'));
    else setError(outcome.message ?? t('errors.sendFailed'));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || stored === null) return;
    if (password.length < 8) return setError(tl('errors.min8'));
    if (password !== again) return setError(tl('errors.mismatch'));

    setBusy(true);
    setError(null);
    const outcome = await confirmReset({ phone: stored, code: code.trim(), newPassword: password }, locale);
    if (outcome.kind === 'done') {
      // Same full load as the sign-in form's own success, for the same reason (see page.tsx).
      const signedIn = await signInAfterReset(stored, password, locale);
      if (signedIn.kind === 'in') {
        window.location.replace('/');
        return;
      }
      // Reset worked, sign-in did not (a closed business is the realistic case): say what the sign-in route said.
      setBusy(false);
      setError(signedIn.kind === 'error' ? (signedIn.message ?? tl('errors.failed')) : tl('errors.unreachable'));
      return;
    }
    setBusy(false);
    setCode('');
    if (outcome.kind === 'locked') lock(outcome.supportPhone);
    else if (outcome.kind === 'unreachable') setError(tl('errors.unreachable'));
    else setError(outcome.message ?? t('errors.resetFailed'));
  }

  const back = (
    <button type="button" className="login-back" onClick={onBack}>
      {t('back')}
    </button>
  );

  if (step === 'locked') {
    return (
      <main className="login-page">
        <div className="login-card" role="alert">
          <div className="login-head">
            <h1>{t('locked.title')}</h1>
            <p>{t('locked.body')}</p>
          </div>
          {supportPhone ? (
            <a className="btn login-submit" href={`tel:${supportPhone}`}>
              {t('locked.call', { phone: supportPhone })}
            </a>
          ) : null}
          {back}
        </div>
      </main>
    );
  }

  if (step === 'code') {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={submit}>
          <div className="login-head">
            <h1>{t('code.title')}</h1>
            <p>{t('code.intro')}</p>
          </div>

          <div className="field">
            <label htmlFor="reset-code">{t('code.label')}</label>
            <input
              id="reset-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
              disabled={busy}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="reset-password">{t('code.newPassword')}</label>
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="reset-again">{t('code.again')}</label>
            <input
              id="reset-again"
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => {
                setAgain(e.target.value);
                setError(null);
              }}
              disabled={busy}
            />
          </div>

          {error ? (
            <p className="field-error login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="btn login-submit" type="submit" disabled={busy || !code.trim() || !password || !again}>
            {busy ? t('code.saving') : t('code.save')}
          </button>

          <button type="button" className="login-back" onClick={() => void send()} disabled={busy || waitSeconds > 0}>
            {waitSeconds > 0 ? t('code.resendIn', { seconds: waitSeconds }) : t('code.resend')}
          </button>
          {back}
        </form>
      </main>
    );
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={send}>
        <div className="login-head">
          <h1>{t('phone.title')}</h1>
          <p>{t('phone.intro')}</p>
        </div>

        <PhoneField id="reset-phone" label={tl('phone')} required value={phone} onChange={setPhone} disabled={busy} />

        {error ? (
          <p className="field-error login-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="btn login-submit" type="submit" disabled={busy || stored === null}>
          {busy ? t('phone.sending') : t('phone.send')}
        </button>
        {back}
      </form>
    </main>
  );
}
