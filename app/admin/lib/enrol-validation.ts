import { GEO_PROBLEM, pinFromText } from './geo-link';
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

const hasLetterOrDigit = (v: string) => /[\p{L}\p{N}]/u.test(v);

/**
 * Every rule the route applies, applied here first.
 *
 * Deliberately a mirror and not the decision: the server re-runs all of it
 * (`businesses.schemas.ts`), and anything this misses is still refused. What it
 * buys is that an admin finds out about a typo before a round trip, and against
 * the field rather than in a banner.
 */
/**
 * Jira GRW-557 — how many stylists a branch may have: asked for every branch, the main one included. A whole number,
 * 1–999 (999 is what Pro calls unlimited); the API refuses anything else with the same words.
 */
export function stylistsProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Enter how many stylists this branch may have';
  if (!/^\d+$/.test(v)) return 'Enter a whole number of stylists';
  const n = Number(v);
  if (n < 1) return 'A branch needs at least 1 place for a stylist';
  if (n > 999) return 'That is more than 999 — check the number';
  return null;
}

/**
 * An offer agreed at the sale, as the form holds it: what the admin typed, before it becomes a request.
 *
 * `enabled` is the section's own toggle, so an admin who opens it and changes their mind is not held to a
 * half-filled form. Everything else is a string for the same reason every other field here is — the input owns the
 * text, and the rules below own what it means.
 */
export interface EnrolDiscountValues {
  enabled: boolean;
  type: 'fixed' | 'percent' | 'final';
  /** Rupees for fixed/final, a 0-100 percentage for percent. */
  value: string;
  /** '1' | '2' | '3' | '6' | '12' bills, or '0' for permanent. */
  durationMonths: string;
  reason: string;
}

export const EMPTY_ENROL_DISCOUNT: EnrolDiscountValues = { enabled: false, type: 'percent', value: '100', durationMonths: '1', reason: '' };

/**
 * What an offer typed on the enrol form is worth, and whether it can be sent.
 *
 * The same three shapes the discount dialog offers, checked against the plan's price — which this form already
 * knows, because it just asked the admin to choose a plan. `planPriceMinor` of 0 means no plan is chosen yet, and
 * the range check waits rather than refusing a figure it cannot judge.
 *
 * Mirrors `EnrolDiscountSchema` in the API's `businesses.schemas.ts`, which remains the authority — as every other
 * rule in this file does.
 */
export function discountProblems(d: EnrolDiscountValues, planPriceMinor: number): Record<string, string> {
  if (!d.enabled) return {};
  const errors: Record<string, string> = {};
  const typed = Number(d.value.trim());

  if (!d.value.trim() || !Number.isFinite(typed) || typed < 0) errors['discount.value'] = 'Enter the discount';
  // Whole numbers only. The API takes an integer, and rounding 12.5 to 13 on the way out would bill a figure
  // other than the one previewed and agreed with the customer.
  else if (d.type === 'percent' && !Number.isInteger(typed)) errors['discount.value'] = 'Enter a whole percentage, such as 10 or 25';
  else if (d.type === 'percent' && typed > 100) errors['discount.value'] = 'A percent discount cannot be more than 100';
  else if (planPriceMinor > 0) {
    const storedMinor = d.type === 'percent' ? Math.round((planPriceMinor * typed) / 100) : Math.round(typed * 100);
    if (d.type === 'final' && storedMinor > planPriceMinor) errors['discount.value'] = 'The final price is above the plan price';
    else if (d.type !== 'final' && storedMinor > planPriceMinor) errors['discount.value'] = 'That discount is larger than the plan price itself';
  }

  if (!d.reason.trim()) errors['discount.reason'] = 'Say why this business gets a discount';
  else if (d.reason.trim().length > 500) errors['discount.reason'] = 'Reason is too long (500 characters maximum)';
  return errors;
}

/**
 * The offer as the API takes it, or null when the section is switched off.
 *
 * `durationMonths: null` is permanent — the same spelling the discount dialog and the route use. A 'final' entry
 * sends the price itself, not a discount, because that is what the API's `final` type means.
 */
export function enrolDiscountBody(
  d: EnrolDiscountValues,
): { type: 'fixed' | 'percent' | 'final'; value: number; reason: string; durationMonths: number | null } | null {
  if (!d.enabled) return null;
  const typed = Number(d.value.trim());
  return {
    type: d.type,
    value: d.type === 'percent' ? Math.round(typed) : Math.round(typed * 100),
    reason: d.reason.trim(),
    durationMonths: d.durationMonths === '0' ? null : Number(d.durationMonths),
  };
}

export function validate(values: {
  name: string;
  country: string;
  typeCode: string;
  planCode: string;
  branches: { name: string; line1: string; city: string; stylists: string; geo?: string }[];
  /** The owner's own name — required since 2026-10-12. */
  ownerName: string;
  nationalNumber: string;
  dialCode: string | null;
  reason: string;
  /** The optional offer, and the plan price to judge it against. Absent is the same as switched off. */
  discount?: EnrolDiscountValues;
  planPriceMinor?: number;
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
    const stylists = stylistsProblem(branch.stylists);
    if (stylists) errors[`branch.${i}.stylists`] = stylists;
    // Jira GRW-563 — empty is fine; something typed has to be a place.
    if (branch.geo?.trim() && !pinFromText(branch.geo)) errors[`branch.${i}.geo`] = GEO_PROBLEM;
  });

  if (values.branches.length === 0) errors['branch.0.name'] = 'Add at least one branch';

  const digits = values.nationalNumber.replace(/\D/g, '');
  const expected = values.dialCode ? NATIONAL_DIGITS[values.dialCode] : undefined;
  // Owner, 2026-10-12 — a person has a name, and this is the only moment the owner's is asked for.
  if (!values.ownerName?.trim()) errors['owner.name'] = 'Enter the owner’s name';
  if (!digits) errors['owner.phone'] = 'Enter the owner’s phone number';
  else if (!values.dialCode) errors['owner.phone'] = 'Enter the full international number, starting with +';
  else if (expected && digits.length !== expected) errors['owner.phone'] = `${expected} digits after ${values.dialCode}`;
  else if (!expected && (digits.length < 7 || digits.length > 14)) errors['owner.phone'] = 'That does not look like a phone number';
  else if (values.dialCode === '+91' && !/^[6-9]/.test(digits)) errors['owner.phone'] = 'An Indian mobile number starts with 6, 7, 8 or 9';

  const reason = values.reason.trim();
  if (reason.length < 5 || !hasLetterOrDigit(reason)) errors.reason = 'Say why this business is being created (at least 5 characters)';
  else if (reason.length > 500) errors.reason = 'Reason is too long (500 characters maximum)';

  if (values.discount) Object.assign(errors, discountProblems(values.discount, values.planPriceMinor ?? 0));

  return errors;
}
