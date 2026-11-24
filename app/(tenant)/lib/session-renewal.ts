/**
 * Owner, 2026-11-24 — a request from a page already open that meets "signed out" renews the session and tries once
 * more, before anyone is sent to sign in.
 *
 * Why: the session cookie lasts an hour and is renewed only while the page is on screen. A till or phone left idle
 * comes back with a lapsed cookie; the first request it makes (a 30-second background check, a tapped tab) answered
 * 401, and `api.ts` sent the browser to /login — while the refresh cookie, good for weeks, would have renewed it.
 *
 * What it does, and nothing else:
 *   - only a 401 whose body says `unauthorized` (the guard's "no live session") — a wrong password elsewhere is a
 *     different refusal and passes straight through;
 *   - only where `mayRenew` says so (the browser, not the sign-in page, not the /auth/ routes themselves);
 *   - renews once (shared by every request that meets it at the same moment) and repeats the request ONCE;
 *   - renewal refused (signed out on purpose, password changed, account removed) or a second 401: the response is
 *     handed back as it was, and the caller's existing handling sends the browser to /login exactly as before.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function withSessionRenewal(fetchFn: FetchLike, renew: () => Promise<boolean>, mayRenew: (input: string) => boolean): FetchLike {
  return async (input, init) => {
    const res = await fetchFn(input, init);
    if (res.status !== 401 || !mayRenew(input)) return res;
    const body = (await res.clone().json().catch(() => null)) as { error?: unknown } | null;
    if (body?.error !== 'unauthorized') return res;
    if (!(await renew())) return res;
    return fetchFn(input, init);
  };
}
