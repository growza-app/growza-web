import { writeAdminSession } from './session';

/**
 * Jira GRW-417 — trading the refresh cookie for a fresh admin session.
 *
 * One place, because three callers need it and they must agree on what a
 * failure means: `SessionGate` (an expired token on a page load), `adminFetch`
 * (a 401 mid-request) and `SessionRefresh` (the background poller). The route
 * itself is public and reads a narrowly-scoped `HttpOnly` cookie the browser
 * sends automatically — nothing here holds the refresh token, and nothing here
 * could read it.
 */
export type RefreshOutcome =
  /** A new bearer token is in `sessionStorage` and returned here. */
  | { status: 'renewed'; token: string }
  /** The server refused the cookie itself. Only a fresh sign-in helps. */
  | { status: 'dead' }
  /** An outage, the throttle, or no network. The session is untouched — ask again later. */
  | { status: 'unavailable' };

/**
 * The attempt currently in flight, if any.
 *
 * All three callers can ask at once — a page load whose token has just expired
 * fires several `adminFetch` calls that each 401 together. Without this they
 * would each POST to the refresh route, and every one of those charges the
 * login throttle's per-caller budget (GRW-161) for a question already being
 * answered.
 */
let inFlight: Promise<RefreshOutcome> | null = null;

export function refreshAdminSession(): Promise<RefreshOutcome> {
  inFlight ??= attempt().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function attempt(): Promise<RefreshOutcome> {
  let res: Response;
  try {
    res = await fetch('/api/admin/v1/auth/refresh', { method: 'POST', cache: 'no-store' });
  } catch {
    // The request never landed (offline, a dropped connection). That is no
    // evidence about the cookie, so it must not cost anybody their session.
    return { status: 'unavailable' };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => null)) as { token?: string; expiresAt?: string } | null;
    if (!body?.token || !body.expiresAt) return { status: 'unavailable' };
    try {
      writeAdminSession({ token: body.token, expiresAt: body.expiresAt });
    } catch {
      // Storage refused (a private window with site data blocked). The token
      // is still good for the caller about to use it; it just will not
      // survive a reload, which is the same position that browser was in
      // before this ever ran.
    }
    return { status: 'renewed', token: body.token };
  }

  /**
   * Only a refusal the server attributes to the COOKIE is final. A provider
   * outage (`provider_unavailable`) or the throttle (429) says nothing about
   * whether this session can be renewed in a minute — treating either as
   * final would sign an admin out over a blip, which is the failure the
   * refresh route itself is careful to avoid.
   */
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  const refusedTheCookie = body?.error === 'refresh_failed' || body?.error === 'no_refresh_token';
  return refusedTheCookie ? { status: 'dead' } : { status: 'unavailable' };
}
