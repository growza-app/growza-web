import { describe, expect, it } from 'vitest';
import {
  digitsOnly,
  displayPhone,
  fromStoredPhone,
  toNationalDigits,
  toStoredPhone,
  nationalPhoneProblem,
  validateNationalPhone,
} from './phone';

/**
 * Jira GRW-199 — one shape for every phone number.
 *
 * The cases below are not invented: each one is something that was accepted and
 * stored before this rule existed. `abc`, `+91`, `0` and `00000` all came back
 * 201 from `POST /api/v1/customers` during QA, and the seeded database still
 * carries `+91786545789` — nine digits — saved by a form with no opinion about
 * length.
 *
 * The duplication mattered more than the junk. `wa_phone` is UNIQUE per tenant
 * and was never normalised, so one person typing their number three ways became
 * three clients with three separate visit histories, and the unique index was
 * protecting nothing.
 */

describe('what a person may type', () => {
  it('keeps only digits', () => {
    expect(digitsOnly('+91 98765-43210')).toBe('919876543210');
    expect(digitsOnly('abc')).toBe('');
  });

  it('takes the LAST ten digits of a pasted number, not the first', () => {
    // The prefixes are what vary; the subscriber number is what does not.
    // Taking the first ten of "+919876543210" gives "919876543", which is the
    // bug this exists to prevent.
    expect(toNationalDigits('+919876543210')).toBe('9876543210');
    expect(toNationalDigits('09876543210')).toBe('9876543210');
    expect(toNationalDigits('98765 43210')).toBe('9876543210');
    expect(toNationalDigits('9876543210')).toBe('9876543210');
  });
});

describe('what may be saved', () => {
  it('accepts ten digits starting 6-9', () => {
    for (const n of ['9876543210', '6000000000', '7123456789', '8999999999']) {
      expect(validateNationalPhone(n)).toBeNull();
      expect(toStoredPhone(n)).toBe(`+91${n}`);
    }
  });

  it('refuses everything QA got past the old rule', () => {
    for (const junk of ['abc', '+91', '0', '00000', "'; DROP TABLE customer;--"]) {
      expect(toStoredPhone(junk), junk).toBeNull();
    }
  });

  it('refuses the nine-digit number already sitting in the seeded data', () => {
    // `+91786545789` is a real row. It is the reason a length check exists.
    expect(toStoredPhone('786545789')).toBeNull();
    expect(validateNationalPhone('786545789')).toBe('1 more digit to go');
  });

  it('refuses a leading digit no Indian mobile starts with', () => {
    expect(validateNationalPhone('1234567890')).toBe('An Indian mobile number starts with 6, 7, 8 or 9');
    expect(toStoredPhone('0123456789')).toBeNull();
  });

  it('counts down while the number is still being typed', () => {
    // A part-typed number is not an error to shout about, it is progress.
    expect(validateNationalPhone('98765')).toBe('5 more digits to go');
    expect(validateNationalPhone('987654321')).toBe('1 more digit to go');
  });

  it('treats an empty field as required or not, as asked', () => {
    expect(validateNationalPhone('')).toBe('Enter a mobile number');
    expect(validateNationalPhone('', { required: false })).toBeNull();
  });
});

describe('a whole value arriving at once (autofill, paste, a test harness)', () => {
  it('strips a recognised country or trunk prefix', () => {
    // The bug this replaced took the first ten of "+919876500001" and got
    // "9198765000" — ten digits, entirely plausible, and the wrong number. The
    // device sweep's sign-in step is what caught it.
    expect(toNationalDigits('+919876500001')).toBe('9876500001');
    expect(toNationalDigits('919876500001')).toBe('9876500001');
    expect(toNationalDigits('0 98765 00001')).toBe('9876500001');
  });

  it('but an ELEVENTH typed digit is a typo, not a prefix', () => {
    // Taking the last ten here would shift the whole number along as somebody
    // typed, rewriting digits they had already checked. The eleventh press
    // does nothing instead.
    expect(toNationalDigits('98765432101')).toBe('9876543210');
    // ...and a leading 9 that is NOT a country code is left where it is.
    expect(toNationalDigits('9987654321')).toBe('9987654321');
  });
});

describe('the three spellings that used to be three clients', () => {
  it('all normalise to one stored value', () => {
    const spellings = ['9876543202', '98765 43202', '+91 98765 43202', '+919876543202', '098765 43202'];
    const stored = new Set(spellings.map((s) => toStoredPhone(toNationalDigits(s))));
    expect(stored).toEqual(new Set(['+919876543202']));
  });
});

describe('a stored number, back into a field', () => {
  it('returns the ten national digits', () => {
    expect(fromStoredPhone('+919876543210')).toBe('9876543210');
    expect(fromStoredPhone(null)).toBe('');
  });

  it('hands back a malformed legacy row as its own digits, so the field complains about it', () => {
    // `+91786545789` predates the rule. Silently reshaping it would hide a bad
    // row; showing it and failing validation is what gets it corrected.
    expect(fromStoredPhone('+91786545789')).toBe('786545789');
    expect(validateNationalPhone(fromStoredPhone('+91786545789'))).not.toBeNull();
  });
});

describe('display', () => {
  it('groups the digits the way an Indian number is read aloud', () => {
    expect(displayPhone('+919876543210')).toBe('+91 98765 43210');
  });

  it('shows a malformed row verbatim rather than pretending', () => {
    expect(displayPhone('+91786545789')).toBe('+91786545789');
  });
});

/** Jira GRW-357 — the same rules as codes, so a screen can say them in the owner's language. */
describe('nationalPhoneProblem', () => {
  it('names each reason', () => {
    expect(nationalPhoneProblem('')).toEqual({ code: 'required' });
    expect(nationalPhoneProblem('', { required: false })).toBeNull();
    expect(nationalPhoneProblem('98765')).toEqual({ code: 'moreDigits', count: 5 });
    expect(nationalPhoneProblem('786545789')).toEqual({ code: 'moreDigits', count: 1 });
    expect(nationalPhoneProblem('98765432101')).toEqual({ code: 'tooMany', count: 10 });
    expect(nationalPhoneProblem('1234567890')).toEqual({ code: 'badStart' });
    expect(nationalPhoneProblem('9876543210')).toBeNull();
  });
});
