import { describe, expect, it } from 'vitest';
import { DIAL_CODES, validate } from './enrol-validation';

/**
 * Jira GRW-138 · GRW-175 — the Add Business form's rules.
 *
 * The server re-runs all of these (`src/api/admin/businesses.schemas.ts`), so
 * nothing here is the last line of defence. What these tests protect is the
 * promise that an admin is told about a mistake *before* a round trip, and
 * against the field they got wrong rather than in a banner.
 */
const good = {
  name: 'Glow Salon',
  country: 'IN',
  typeCode: 'salon',
  planCode: 'prime',
  branches: [{ name: 'MG Road', line1: '', city: '' }],
  nationalNumber: '9876543210',
  dialCode: '+91',
  reason: 'Signed up on a call',
};

describe('a complete, correct form', () => {
  it('reports nothing', () => {
    expect(validate(good)).toEqual({});
  });
});

describe('the owner’s phone — the field this story exists for', () => {
  it('accepts ten digits under +91', () => {
    expect(validate({ ...good, nationalNumber: '9876543210' })['owner.phone']).toBeUndefined();
  });

  it('refuses nine digits and says how many are expected', () => {
    expect(validate({ ...good, nationalNumber: '987654321' })['owner.phone']).toBe('10 digits after +91');
  });

  it('refuses eleven digits', () => {
    expect(validate({ ...good, nationalNumber: '98765432101' })['owner.phone']).toBe('10 digits after +91');
  });

  it('refuses an Indian number that cannot be a mobile', () => {
    // Landline-style prefixes are a real mistake, and one that reaches a
    // reminder nobody receives.
    expect(validate({ ...good, nationalNumber: '1234567890' })['owner.phone']).toBe(
      'An Indian mobile number starts with 6, 7, 8 or 9',
    );
  });

  it('refuses an empty number', () => {
    expect(validate({ ...good, nationalNumber: '' })['owner.phone']).toBe('Enter the owner’s phone number');
  });

  it('applies the right length for another country’s dial code', () => {
    // +971 is nine digits, not ten — the rule follows the country rather than
    // assuming India, which is the whole reason the dial code is not a constant.
    expect(validate({ ...good, country: 'AE', dialCode: '+971', nationalNumber: '501234567' })['owner.phone']).toBeUndefined();
    expect(validate({ ...good, country: 'AE', dialCode: '+971', nationalNumber: '9876543210' })['owner.phone']).toBe(
      '9 digits after +971',
    );
  });

  it('asks for the full number when the country has no known dial code', () => {
    // Never guesses. A silent +91 on a business in a country we do not have a
    // code for is a wrong number nobody notices until a message fails.
    expect(validate({ ...good, country: 'BR', dialCode: null, nationalNumber: '11987654321' })['owner.phone']).toBe(
      'Enter the full international number, starting with +',
    );
  });

  it('has +91 as the code for India, since that is what the default assumes', () => {
    expect(DIAL_CODES.IN).toBe('+91');
  });
});

describe('the other fields', () => {
  it('refuses a one-character business name', () => {
    expect(validate({ ...good, name: 'A' }).name).toContain('at least 2 characters');
  });

  it('refuses a name that is only punctuation', () => {
    expect(validate({ ...good, name: '...' }).name).toBeTruthy();
  });

  it('refuses a name over 120 characters', () => {
    expect(validate({ ...good, name: 'a'.repeat(121) }).name).toContain('too long');
  });

  it('accepts a name at exactly the boundary', () => {
    expect(validate({ ...good, name: 'ab' }).name).toBeUndefined();
    expect(validate({ ...good, name: 'a'.repeat(120) }).name).toBeUndefined();
  });

  it('accepts a non-Latin business name', () => {
    // `\\p{L}` and not `[a-z]`: "ग्लो सैलून" is a business name.
    expect(validate({ ...good, name: 'ग्लो सैलून' }).name).toBeUndefined();
  });

  it('refuses a country that is not two letters', () => {
    expect(validate({ ...good, country: 'India' }).country).toBeTruthy();
    expect(validate({ ...good, country: 'I' }).country).toBeTruthy();
    expect(validate({ ...good, country: 'in' }).country).toBeUndefined();
  });

  it('requires a type and a plan to have been chosen', () => {
    expect(validate({ ...good, typeCode: '' }).businessTypeCode).toBeTruthy();
    expect(validate({ ...good, planCode: '' }).planCode).toBeTruthy();
  });

  it('refuses a branch name that is too short or too long', () => {
    expect(validate({ ...good, branches: [{ name: 'M', line1: '', city: '' }] })['branch.0.name']).toBeTruthy();
    expect(validate({ ...good, branches: [{ name: 'x'.repeat(81), line1: '', city: '' }] })['branch.0.name']).toContain('too long');
  });

  it('refuses an address or city over its limit, but not an empty one', () => {
    expect(validate({ ...good, branches: [{ name: 'MG Road', line1: 'x'.repeat(161), city: '' }] })['branch.0.line1']).toContain('too long');
    expect(validate({ ...good, branches: [{ name: 'MG Road', line1: '', city: 'x'.repeat(81) }] })['branch.0.city']).toContain('too long');
    expect(validate(good)['branch.0.line1']).toBeUndefined();
  });

  it('asks for no email at all — GRW-189 removed it from the product', () => {
    // The form used to require the owner's email and this suite used to assert
    // five malformed shapes. There is no field to be malformed now: an owner is
    // a phone number, and `owner.email` is not a key this validator can emit.
    expect(Object.keys(validate({ ...good, name: '', reason: '', nationalNumber: '' }))).not.toContain('owner.email');
  });

  it('refuses a reason too short to be a reason', () => {
    // "x" satisfies "not empty" and answers nothing — and this is the sentence
    // somebody reads months later asking why a business exists.
    expect(validate({ ...good, reason: 'x' }).reason).toContain('at least 5 characters');
    expect(validate({ ...good, reason: '     ' }).reason).toBeTruthy();
    expect(validate({ ...good, reason: 'Trial' }).reason).toBeUndefined();
  });
});

describe('branches', () => {
  const withBranches = (...names: string[]) => ({
    ...good,
    branches: names.map((name) => ({ name, line1: '', city: '' })),
  });

  it('accepts several branches with distinct names', () => {
    expect(validate(withBranches('MG Road', 'Indiranagar', 'Koramangala'))).toEqual({});
  });

  it('refuses two branches with the same name, and blames the later one', () => {
    // The later row is the one the person is looking at when they realise —
    // reporting it against the first would send them to a field that is fine.
    const errors = validate(withBranches('MG Road', 'MG Road'));
    expect(errors['branch.1.name']).toBe('Another branch already has this name');
    expect(errors['branch.0.name']).toBeUndefined();
  });

  it('treats a difference of case or padding as the same name', () => {
    expect(validate(withBranches('MG Road', '  mg road ')) ['branch.1.name']).toBeTruthy();
  });

  it('reports each bad branch against its own row', () => {
    const errors = validate(withBranches('MG Road', 'X', 'Koramangala'));
    expect(Object.keys(errors)).toEqual(['branch.1.name']);
  });

  it('refuses a business with no branch at all', () => {
    expect(validate({ ...good, branches: [] })['branch.0.name']).toBe('Add at least one branch');
  });
});

describe('reporting', () => {
  it('reports every bad field at once, not just the first', () => {
    const errors = validate({ ...good, name: '', reason: '', nationalNumber: '' });
    expect(Object.keys(errors).sort()).toEqual(['name', 'owner.phone', 'reason']);
  });
});
