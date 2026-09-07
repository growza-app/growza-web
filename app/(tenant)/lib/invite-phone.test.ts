import { describe, expect, it } from 'vitest';
import { toE164, validateInvitePhone } from './validate';

/**
 * Jira GRW-63 · GRW-67 — the client's phone rule against the server's.
 *
 * The point of these is not that a regex works. It is that this check and
 * `PHONE` in src/api/tenant/team.controller.ts agree: a number this file
 * accepts must not come back as a 400, and a number the server would take must
 * not be blocked here. Both directions are tested, because only one of them is
 * the one that bites — a looser client check is a raw 400 in an owner's face.
 */
describe('toE164', () => {
  it('completes a bare Indian ten-digit number', () => {
    // What an owner actually types when asked for a stylist's number.
    expect(toE164('9812345678')).toBe('+919812345678');
    expect(toE164('98123 45678')).toBe('+919812345678');
    expect(toE164('98123-45678')).toBe('+919812345678');
  });

  it('leaves an already-international number alone', () => {
    expect(toE164('+919812345678')).toBe('+919812345678');
    expect(toE164('+91 98123 45678')).toBe('+919812345678');
    expect(toE164('+442071838750')).toBe('+442071838750');
  });

  it('does not invent a country code for a number that is simply wrong', () => {
    // Nine digits is not "a +91 short of correct" — guessing here would post
    // a number the server rejects, or worse, a real number nobody meant.
    expect(toE164('981234567')).toBeNull();
    expect(toE164('98123456789')).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164('not a number')).toBeNull();
  });

  it('refuses a leading zero, which E.164 has no room for', () => {
    expect(toE164('+09812345678')).toBeNull();
  });
});

describe('validateInvitePhone', () => {
  it('accepts what the invite API accepts', () => {
    expect(validateInvitePhone('9812345678')).toBeNull();
    expect(validateInvitePhone('+91 98123 45678')).toBeNull();
  });

  it('names the problem rather than saying "invalid"', () => {
    expect(validateInvitePhone('')).toBe('Enter a mobile number');
    expect(validateInvitePhone('12345')).toMatch(/too short/);
    expect(validateInvitePhone('9812345678901234567')).toMatch(/too long/);
    expect(validateInvitePhone('98123+45678')).toMatch(/\+ belongs at the start/);
  });

  it('agrees with the server regex on every case it accepts', () => {
    // The server's own rule, copied here so the two can be compared directly.
    const SERVER_RE = /^\+[1-9]\d{7,14}$/;
    for (const input of ['9812345678', '+919812345678', '+442071838750', '+1 415 555 0134', '98123 45678']) {
      const accepted = validateInvitePhone(input) === null;
      expect(accepted, `client accepted ${input}`).toBe(true);
      // What the panel would actually POST must satisfy the server.
      expect(SERVER_RE.test(toE164(input)!), `server would accept ${input}`).toBe(true);
    }
  });
});
