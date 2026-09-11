/**
 * Jira GRW-199 — one shape for every phone number in the salon app.
 *
 * ## Why this exists
 *
 * Nine separate `<input type="tel">` fields each did their own thing. The
 * shared validator accepted "an optional +, a non-zero leading digit, 8–15
 * digits" — deliberately lenient, so that the forms and the routes agreed —
 * and the routes were lenient because the forms were. QA walked straight
 * through it: `abc`, `+91`, `0`, `00000` and `'; DROP TABLE customer;--` were
 * all accepted and stored verbatim as somebody's phone number.
 *
 * The seeded database already carries `+91786545789` — **nine digits**. Not a
 * test row: a real one, saved by a form that had no opinion about length.
 *
 * The duplication was worse than the junk. `wa_phone` is UNIQUE per tenant and
 * never normalised, so one person typing `9876543202`, `98765 43202` and
 * `+919876543202` created THREE clients — three visit histories, three
 * lifetime-spend figures, for one person. The unique index was doing exactly
 * what it was told and protecting nothing.
 *
 * ## The rule
 *
 * The country code is not a field. It is rendered, greyed, beside the input
 * and prepended on save, so there is nothing to type wrong and nothing to
 * forget. What the receptionist types is ten digits, and Indian mobile numbers
 * are ten digits beginning 6, 7, 8 or 9.
 *
 * ## The seam
 *
 * `DIAL_CODE` is one constant, and `tenant.country` (migration 0047) is where
 * it would come from the day this product sells outside India. The admin plane
 * already has a dial-code selector for exactly that reason and is deliberately
 * NOT changed here — it creates businesses in any country. This file is the
 * salon-facing app, which today is sold in one.
 */

/** The one place the country code is written. See "The seam" above. */
export const DIAL_CODE = '+91';

/** How many digits follow the dial code. */
export const NATIONAL_DIGITS = 10;

/**
 * Indian mobile numbers begin 6, 7, 8 or 9.
 *
 * Same rule the admin plane's enrolment form already applies. Catching a
 * leading 0 or 1 at the desk is worth more than catching it in a reminder that
 * never arrives.
 */
const VALID_FIRST_DIGIT = /^[6-9]/;

/** Everything that is not a digit, removed. What a person types is not what is stored. */
export function digitsOnly(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

/**
 * The ten digits out of anything a person might type, paste or autofill.
 *
 * Two different situations, and the rule has to tell them apart:
 *
 * - **A whole value arriving at once** — autofill, a password manager, a paste,
 *   a test harness — carries a prefix. `91` and twelve digits, or `0` and
 *   eleven, are the two shapes an Indian number arrives in, and the subscriber
 *   number is at the END of both.
 * - **Someone typing an eleventh digit** has made a typo. The subscriber number
 *   is at the START, and taking the last ten would silently shift the whole
 *   number along by one as they typed — the field rewriting digits they had
 *   already checked.
 *
 * So a recognised prefix is stripped, and anything else over-long keeps its
 * first ten. The same distinction the server's `toStoredPhone` makes.
 */
export function toNationalDigits(raw: string): string {
  const digits = digitsOnly(raw);
  if (digits.length <= NATIONAL_DIGITS) return digits;
  if (digits.length === NATIONAL_DIGITS + 2 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === NATIONAL_DIGITS + 1 && digits.startsWith('0')) return digits.slice(1);
  return digits.slice(0, NATIONAL_DIGITS);
}

/** Null when the ten digits are usable; otherwise what to show under the field. */
export function validateNationalPhone(raw: string, { required = true } = {}): string | null {
  const digits = digitsOnly(raw);
  if (digits.length === 0) return required ? 'Enter a mobile number' : null;
  if (digits.length < NATIONAL_DIGITS) return `${NATIONAL_DIGITS - digits.length} more digit${NATIONAL_DIGITS - digits.length === 1 ? '' : 's'} to go`;
  if (digits.length > NATIONAL_DIGITS) return `A mobile number is ${NATIONAL_DIGITS} digits`;
  if (!VALID_FIRST_DIGIT.test(digits)) return 'An Indian mobile number starts with 6, 7, 8 or 9';
  return null;
}

/**
 * The stored form: `+91` and ten digits, always.
 *
 * Returns null when the input is not a usable number, so a caller cannot
 * accidentally save a half-typed one. Every write path runs through this, which
 * is what makes `(tenant_id, wa_phone)` a real uniqueness guarantee rather than
 * a guarantee about strings.
 */
export function toStoredPhone(raw: string): string | null {
  const digits = digitsOnly(raw);
  if (digits.length !== NATIONAL_DIGITS || !VALID_FIRST_DIGIT.test(digits)) return null;
  return `${DIAL_CODE}${digits}`;
}

/**
 * A stored number back into the ten digits, for editing.
 *
 * A field that shows `+919876543210` inside the box, next to a greyed `+91`
 * label, reads as a bug. Existing rows are not all well-formed — see
 * `+91786545789` above — so anything that does not fit the shape comes back as
 * its own digits and the validator complains about it, which is the correct
 * outcome for a row that was saved before this rule existed.
 */
export function fromStoredPhone(stored: string | null | undefined): string {
  if (!stored) return '';
  /*
   * Strip the dial code as a PREFIX, never by slicing the last ten digits.
   *
   * Slicing was the first version and its own test killed it: `+91786545789`
   * is eleven digits, so "last ten" produced `1786545789` — a different number,
   * ten digits long, starting with a 1, which then rendered as a perfectly
   * plausible `+91 17865 45789`. A malformed row silently became a wrong row
   * that LOOKED right, which is worse than showing the mess.
   *
   * `toNationalDigits` above still takes the last ten, and correctly: that one
   * handles a PASTE, where the prefixes vary and the subscriber number does
   * not. This one is unpicking a value this app itself wrote.
   */
  const trimmed = stored.trim();
  const withoutCode = trimmed.startsWith(DIAL_CODE) ? trimmed.slice(DIAL_CODE.length) : trimmed;
  return digitsOnly(withoutCode);
}

/** `+91 98765 43210` — for display only; never for storage or comparison. */
export function displayPhone(stored: string | null | undefined): string {
  const national = fromStoredPhone(stored);
  if (national.length !== NATIONAL_DIGITS) return stored ?? '';
  return `${DIAL_CODE} ${national.slice(0, 5)} ${national.slice(5)}`;
}
