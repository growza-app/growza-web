import { ApiError } from './api';

/**
 * Jira GRW-66 · GRW-160 — what a failed `me()` means.
 *
 * The shell has always caught every API failure and rendered a degraded page
 * (GRW-122). One of those failures now means something different: a 401 is not
 * "the API is having a bad day", it is "we do not know who you are", and the
 * only useful response is the sign-in screen.
 *
 * The distinction is BR-03 and it matters in both directions. Redirecting on
 * every failure would throw an owner out to a login screen during an API
 * outage, where signing in would not work either and would look like their
 * password had stopped working. Redirecting on none of them leaves an
 * unauthenticated visitor staring at an empty dashboard with no way in.
 *
 * A pure function because the alternative — an `instanceof` check buried in a
 * layout's catch block — is exactly the sort of thing that gets loosened to
 * `catch { redirect() }` by someone in a hurry, and nothing would fail.
 */
export function shouldSignInAgain(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * Where the sign-in screen lives. Its own root layout, outside `(tenant)` —
 * see `(auth)/layout.tsx` for why that is load-bearing rather than tidy.
 */
export const SIGN_IN_PATH = '/login';

/**
 * Jira GRW-79 · GRW-164 — the API says this account may not operate.
 *
 * A 403 the owner is meant to read, not a permission failure: suspended, closed,
 * or still being set up. Returns the server's own sentence, so the screen and
 * the API can never word it differently — the copy lives in one place
 * (`platform/tenant-status.ts`) and travels.
 *
 * Distinct from `shouldSignInAgain` on purpose. Signing in again is exactly what
 * will not help here, and sending them to the login screen to find that out is
 * the failure this replaces.
 */
export function accountStatusRefusal(
  error: unknown,
): { reason: string; message: string; support?: { phone?: string } } | null {
  if (!(error instanceof ApiError) || error.status !== 403) return null;
  const reason = error.code;
  if (typeof reason !== 'string' || !reason.startsWith('account_')) return null;
  return { reason, message: error.message, ...(error.support ? { support: error.support } : {}) };
}
