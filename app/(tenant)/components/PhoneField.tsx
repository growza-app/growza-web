'use client';

import { DIAL_CODE, toNationalDigits } from '../lib/phone';

/**
 * Jira GRW-199 — the only way a phone number is typed in this app.
 *
 * The country code is CHROME, not a field: greyed, unfocusable, attached to the
 * left of the box. There is nothing to type wrong, nothing to forget, and no
 * way to produce the three variants of one number that were quietly creating
 * three separate clients.
 *
 * Everything that is not a digit is dropped as it is typed, rather than
 * complained about afterwards. Somebody pasting `+91 98765 43210` or
 * `098765 43210` gets the ten digits that matter — the prefixes are what vary,
 * the subscriber number is what does not — and somebody typing letters simply
 * sees nothing appear, which is a clearer "no" than a message under the field.
 *
 * `inputMode="numeric"` puts a phone keypad in front of a receptionist rather
 * than a full keyboard. The ten-digit limit is enforced in the change handler
 * and NOT with `maxLength` — see the comment on `onChange` for what that cost
 * the first time.
 */
export function PhoneField({
  id,
  value,
  onChange,
  label,
  hint,
  error,
  required = false,
  optionalLabel = 'optional', // i18n-ok: default for callers outside a translated screen; the sign-in page has no provider
  autoFocus = false,
  disabled = false,
}: {
  id: string;
  /** The NATIONAL digits only — never the stored `+91…` form. */
  value: string;
  onChange: (nationalDigits: string) => void;
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  /** The word shown beside an optional field. Translated screens pass `t('common.optional')`. */
  optionalLabel?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {!required && <span className="field-optional">{optionalLabel}</span>}
      </label>

      <div className={`phone-field ${error ? 'phone-field-invalid' : ''} ${disabled ? 'phone-field-off' : ''}`}>
        {/* Not an input, and deliberately not focusable: tabbing must land on
            the digits, and there is nothing here anyone may change. */}
        <span className="phone-dial" aria-hidden="true">
          {DIAL_CODE}
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          value={value}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          aria-invalid={error ? true : undefined}
          /*
           * Length is handled in JS, and there is deliberately no `maxLength`.
           *
           * `maxLength={10}` was the first attempt and it CORRUPTED the number
           * it was meant to protect: the browser truncates the raw STRING
           * before React sees it, so autofilling "+919876500001" arrived as
           * "+919876500" — the "+91" having eaten three of the ten allowed
           * characters — leaving nine digits and a wrong number. The device
           * sweep's sign-in step is what caught it, and the screenshot showed
           * "919876500" sitting in the field.
           *
           * `toNationalDigits` strips a recognised country or trunk prefix and
           * otherwise keeps the first ten, so a paste lands correctly and an
           * eleventh keystroke does nothing rather than shifting the number.
           */
          onChange={(e) => onChange(toNationalDigits(e.target.value))}
        />
      </div>

      {error ? (
        <div role="alert" className="field-error" id={`${id}-error`}>
          {error}
        </div>
      ) : hint ? (
        <div className="field-hint" id={`${id}-hint`}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
