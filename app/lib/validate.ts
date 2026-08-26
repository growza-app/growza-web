/**
 * Shared field validators for the dashboard forms.
 *
 * These deliberately MIRROR the server's rules rather than tightening them.
 * A client check stricter than the API rejects data the backend would happily
 * store; a looser one lets the user hit Save and get a raw 400 back. Both are
 * worse than one rule expressed in two places, so when the server changes,
 * change these with it.
 *
 * Server counterparts live in `src/api/index.ts` (`EMAIL_RE`,
 * `validateProviderBody`).
 */

/** Mirrors `EMAIL_RE` in src/api/index.ts. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * E.164-ish: an optional +, a non-zero leading digit, 8–15 digits total.
 * Formatting characters people actually type (spaces, hyphens, brackets) are
 * stripped before the test rather than rejected — refusing "+91 98765 43210"
 * for containing spaces is a validator being pedantic at the user's expense.
 */
const PHONE_RE = /^\+?[1-9]\d{7,14}$/;

/** Strips the separators a human types, leaving digits and a leading +. */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s()\-.]/g, '');
}

/** Null when valid; otherwise the message to show under the field. */
export function validatePhone(raw: string, { required = true } = {}): string | null {
  const value = raw.trim();
  if (!value) return required ? 'Mobile number is required' : null;
  const normalized = normalizePhone(value);
  if (/[^\d+]/.test(normalized)) return 'Use digits only, with an optional country code';
  if (normalized.includes('+') && !normalized.startsWith('+')) return 'The + belongs at the start, before the country code';
  if (!PHONE_RE.test(normalized)) {
    const digits = normalized.replace(/\D/g, '').length;
    if (digits < 8) return 'That looks too short for a phone number';
    if (digits > 15) return 'That looks too long for a phone number';
    return 'Enter a valid mobile number, e.g. +91 98765 43210';
  }
  return null;
}

/** Null when valid. Empty is valid — email is optional everywhere it is used. */
export function validateEmail(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (!EMAIL_RE.test(value)) return 'Enter a valid email address, e.g. name@salon.in';
  return null;
}

/** Null when valid. */
export function validateRequired(raw: string, label: string): string | null {
  return raw.trim() ? null : `${label} is required`;
}
