/**
 * Shared field validators for the dashboard forms.
 *
 * These deliberately MIRROR the server's rules rather than tightening them.
 * A client check stricter than the API rejects data the backend would happily
 * store; a looser one lets the user hit Save and get a raw 400 back. Both are
 * worse than one rule expressed in two places, so when the server changes,
 * change these with it.
 *
 * Server counterparts live in `src/api/index.ts` (`validateProviderBody`).
 */

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

/** Null when valid. */
export function validateRequired(raw: string, label: string): string | null {
  return raw.trim() ? null : `${label} is required`;
}

/**
 * Jira GRW-63 · GRW-67 — the E.164 form the server actually stores.
 *
 * `validatePhone` above is deliberately lenient: it accepts a bare
 * `9812345678` because most forms in this product post to routes that are
 * equally lenient. **Team invites are not one of them.** BR-04 says an invite's
 * phone is stored and compared in E.164, matching `customer.wa_phone` (which
 * really does hold `+919876543201`), so `POST /api/v1/team/invites` requires
 * the leading `+`.
 *
 * Leaving the looser check in front of the stricter route is precisely the
 * failure this file's own header warns about — "a looser one lets the user hit
 * Save and get a raw 400 back". So a bare number is COMPLETED rather than
 * refused: an owner typing their stylist's ten digits is doing the normal
 * thing, not making a mistake.
 *
 * The `+91` default is the assumption `formatPhone` has always made when it
 * renders a bare ten-digit number. It is the seam to widen when the product
 * sells outside India — `tenant.country` (migration 0047) is where the dial
 * code would come from — and it is written here, once, rather than in the
 * panel.
 */
const DEFAULT_DIAL_CODE = '+91';

/** The phone shape `POST /api/v1/team/invites` accepts. Mirrors `PHONE` in src/api/tenant/team.controller.ts. */
const E164_RE = /^\+[1-9]\d{7,14}$/;

/**
 * A number in the shape the invite API takes, or `null` if it cannot be one.
 *
 * Never guesses at anything but the country code: a number that is the wrong
 * length is wrong, not a `+91` short of correct.
 */
export function toE164(raw: string): string | null {
  const value = normalizePhone(raw.trim());
  const candidate = value.startsWith('+')
    ? value
    : /^\d{10}$/.test(value)
      ? `${DEFAULT_DIAL_CODE}${value}`
      : value;
  return E164_RE.test(candidate) ? candidate : null;
}

/** Null when the number can be sent an invite; otherwise the message to show under the field. */
export function validateInvitePhone(raw: string): string | null {
  const value = raw.trim();
  if (!value) return 'Enter a mobile number';
  // Defer to the shared validator first, so shape complaints ("too short",
  // "the + belongs at the start") are worded once for the whole product.
  const shape = validatePhone(value);
  if (shape) return shape;
  return toE164(value) ? null : 'Enter a valid mobile number, e.g. +91 98765 43210';
}
