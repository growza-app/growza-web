import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { accountStatusRefusal, shouldSignInAgain } from './session-policy';

/**
 * Jira GRW-79 · GRW-164 — telling "sign in again" apart from "you are locked out".
 *
 * Conflating them is the failure this exists to prevent: sending a suspended
 * owner to the login screen makes them discover, by trying, that signing in is
 * exactly what will not help.
 */
describe('accountStatusRefusal', () => {
  it.each([
    ['account_suspended', 'This account is suspended. Contact support.'],
    ['account_not_ready', 'This account is still being set up.'],
    ['account_closed', 'This account has been closed.'],
  ])('recognises %s and passes the server‘s own words through', (code, message) => {
    const refusal = accountStatusRefusal(new ApiError(403, message, code));
    expect(refusal).toEqual({ reason: code, message });
  });

  it('ignores an ordinary permission 403', () => {
    // A stylist reaching an owner-only route (GRW-156) is refused for a
    // completely different reason and must not get the account screen.
    expect(accountStatusRefusal(new ApiError(403, 'forbidden', 'forbidden'))).toBeNull();
  });

  it('ignores a 403 with no code at all', () => {
    expect(accountStatusRefusal(new ApiError(403, 'nope'))).toBeNull();
  });

  it.each([401, 404, 429, 500])('ignores a %s', (status) => {
    expect(accountStatusRefusal(new ApiError(status, 'x', 'account_suspended'))).toBeNull();
  });

  it('ignores anything that is not an ApiError', () => {
    for (const value of [null, undefined, new TypeError('fetch failed'), { status: 403, code: 'account_suspended' }]) {
      expect(accountStatusRefusal(value)).toBeNull();
    }
  });

  it('is not the same question as shouldSignInAgain', () => {
    const suspended = new ApiError(403, 'suspended', 'account_suspended');
    const unauthenticated = new ApiError(401, 'unauthorized');

    // The two must never both fire, or the layout's branches race.
    expect(shouldSignInAgain(suspended)).toBe(false);
    expect(accountStatusRefusal(unauthenticated)).toBeNull();
  });
});
