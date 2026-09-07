/**
 * Jira GRW-138 · GRW-175 — the Add Business form's rules, as pure functions.
 *
 * Split out of the modal so they can be TESTED. This repository's web harness
 * runs logic, not components (vitest, `environment: 'node'`), so validation
 * living inside a `.tsx` is validation that can only ever be exercised through
 * the server — which tests the server's copy of the rules, not this one.
 *
 * These mirror `src/api/admin/businesses.schemas.ts`, which remains the
 * authority. Anything missed here is still refused there; what these buy is
 * that an admin hears about a typo before a round trip, against the field.
 */

/**
 * The dial code an admin never has to type — and why it follows Country rather
 * than being a constant.
 *
 * Hardcoding `+91` was the ask, and for the pilot it is right: Growza bills in
 * INR, invoices GST and runs on IST (GRW-179). But this same form offers Dubai,
 * Singapore, London and New York timezones and accepts any ISO country code, so
 * a fixed `+91` would happily attach an Indian number to a business in the UAE
 * — a wrong number nobody notices until a reminder fails to send.
 *
 * So: `+91` is the default because IN is the default country, and it moves with
 * the field that already says where the business is. A country not listed here
 * asks for the full international number instead of silently assuming India,
 * because a guess is the one thing this field must not make.
 */
export const DIAL_CODES: Record<string, string> = {
  IN: '+91',
  AE: '+971',
  SG: '+65',
  GB: '+44',
  US: '+1',
  LK: '+94',
  BD: '+880',
  NP: '+977',
};

/** National-number length per dial code, where it is a fixed, well-known rule. */
export const NATIONAL_DIGITS: Record<string, number> = { '+91': 10, '+971': 9, '+65': 8, '+1': 10 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const hasLetterOrDigit = (v: string) => /[\p{L}\p{N}]/u.test(v);

/**
 * Every rule the route applies, applied here first.
 *
 * Deliberately a mirror and not the decision: the server re-runs all of it
 * (`businesses.schemas.ts`), and anything this misses is still refused. What it
 * buys is that an admin finds out about a typo before a round trip, and against
 * the field rather than in a banner.
 */
export function validate(values: {
  name: string;
  country: string;
  typeCode: string;
  planCode: string;
  branches: { name: string; line1: string; city: string }[];
  nationalNumber: string;
  dialCode: string | null;
  email: string;
  reason: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = values.name.trim();
  if (name.length < 2 || !hasLetterOrDigit(name)) errors.name = 'Enter the business name (at least 2 characters)';
  else if (name.length > 120) errors.name = 'Business name is too long (120 characters maximum)';

  if (!/^[A-Z]{2}$/.test(values.country.trim().toUpperCase())) errors.country = 'Two-letter country code, e.g. IN';
  if (!values.typeCode) errors.businessTypeCode = 'Choose a type of business';
  if (!values.planCode) errors.planCode = 'Choose a plan';

  /**
   * Errors are keyed per branch (`branch.0.name`), because "the branch name is
   * too short" is unhelpful when there are five of them. The single-branch case
   * is just index 0 — the shape does not change with the toggle, here or on the
   * server.
   */
  const seen = new Map<string, number>();
  values.branches.forEach((branch, i) => {
    const name = branch.name.trim();
    if (name.length < 2 || !hasLetterOrDigit(name)) errors[`branch.${i}.name`] = 'Enter the branch name (at least 2 characters)';
    else if (name.length > 80) errors[`branch.${i}.name`] = 'Branch name is too long (80 characters maximum)';
    else {
      // A duplicate is reported on the LATER branch, which is the one the
      // person is looking at when they realise.
      const key = name.toLowerCase();
      if (seen.has(key)) errors[`branch.${i}.name`] = 'Another branch already has this name';
      else seen.set(key, i);
    }

    if (branch.line1.trim().length > 160) errors[`branch.${i}.line1`] = 'Address is too long (160 characters maximum)';
    if (branch.city.trim().length > 80) errors[`branch.${i}.city`] = 'City is too long (80 characters maximum)';
  });

  if (values.branches.length === 0) errors['branch.0.name'] = 'Add at least one branch';

  const digits = values.nationalNumber.replace(/\D/g, '');
  const expected = values.dialCode ? NATIONAL_DIGITS[values.dialCode] : undefined;
  if (!digits) errors['owner.phone'] = 'Enter the owner’s phone number';
  else if (!values.dialCode) errors['owner.phone'] = 'Enter the full international number, starting with +';
  else if (expected && digits.length !== expected) errors['owner.phone'] = `${expected} digits after ${values.dialCode}`;
  else if (!expected && (digits.length < 7 || digits.length > 14)) errors['owner.phone'] = 'That does not look like a phone number';
  else if (values.dialCode === '+91' && !/^[6-9]/.test(digits)) errors['owner.phone'] = 'An Indian mobile number starts with 6, 7, 8 or 9';

  const email = values.email.trim();
  if (!email) errors['owner.email'] = 'Enter the owner’s email address';
  else if (!EMAIL_RE.test(email)) errors['owner.email'] = 'Enter a valid email address';
  else if (email.length > 254) errors['owner.email'] = 'Email is too long';

  const reason = values.reason.trim();
  if (reason.length < 5 || !hasLetterOrDigit(reason)) errors.reason = 'Say why this business is being created (at least 5 characters)';
  else if (reason.length > 500) errors.reason = 'Reason is too long (500 characters maximum)';

  return errors;
}
