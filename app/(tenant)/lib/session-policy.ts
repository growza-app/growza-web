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
