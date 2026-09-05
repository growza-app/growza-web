import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { shouldSignInAgain, SIGN_IN_PATH } from './session-policy';

/**
 * Jira GRW-66 · GRW-160 — which failures mean "sign in again".
 *
 * The whole story turns on this one distinction (BR-03), and it is a single
 * `if` in a layout's catch block — the kind of line that gets loosened to
 * `catch { redirect() }` by someone in a hurry with nothing failing to stop
 * them. These are what would fail.
 */
describe('AC-03 — an unauthenticated visitor is sent to sign in', () => {
  it('treats a 401 as a reason to sign in again', () => {
    expect(shouldSignInAgain(new ApiError(401, 'unauthorized'))).toBe(true);
  });

  it('points at the sign-in screen‘s own route', () => {
    expect(SIGN_IN_PATH).toBe('/login');
  });
});

describe('AC-05 — the API being down is not the session being over', () => {
  it('does not redirect on a 500', () => {
    // Sending an owner to a login screen during an outage would make a server
    // fault look like their password had stopped working, and signing in
    // would not have worked either.
    expect(shouldSignInAgain(new ApiError(500, 'boom'))).toBe(false);
  });

  it('does not redirect when the API cannot be reached at all', () => {
    // A network failure is a TypeError, not an ApiError — no status to read.
    expect(shouldSignInAgain(new TypeError('fetch failed'))).toBe(false);
  });

  it('does not redirect on a 403', () => {
    // 403 is a verified person who is not a member of anything (GRW-155).
    // Signing in again would produce the same token and the same 403.
    expect(shouldSignInAgain(new ApiError(403, 'forbidden'))).toBe(false);
  });

  it('does not redirect on a 429 from the login limiter', () => {
    expect(shouldSignInAgain(new ApiError(429, 'too_many_attempts'))).toBe(false);
  });

  it('ignores anything that is not an error at all', () => {
    for (const value of [null, undefined, 'unauthorized', 401, { status: 401 }]) {
      // Notably `{ status: 401 }`: a duck-typed check would redirect on any
      // object that happened to carry the number.
      expect(shouldSignInAgain(value)).toBe(false);
    }
  });
});
