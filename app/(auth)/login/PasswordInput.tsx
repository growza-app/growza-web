'use client';

import { useTranslations } from 'next-intl';
import { useState, type InputHTMLAttributes } from 'react';

/** A password box with an eye that shows what was typed. Starts hidden. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const t = useTranslations('auth.login');
  const [shown, setShown] = useState(false);
  return (
    <div className="password-field">
      <input {...props} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        className="password-eye"
        aria-label={shown ? t('hidePassword') : t('showPassword')}
        aria-pressed={shown}
        onClick={() => setShown((v) => !v)}
        disabled={props.disabled}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {shown ? <path d="M4 4l16 16" /> : null}
        </svg>
      </button>
    </div>
  );
}
