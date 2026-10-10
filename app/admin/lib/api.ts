import { refreshAdminSession } from './refresh';
import { clearAdminSession } from './session';

/**
 * The admin plane's fetch wrapper (GRW-99) — same-origin `/api/admin/v1/...`
 * through Next's rewrite (next.config.ts), same shape as the tenant portal's
 * own `lib/api.ts`. The one thing that differs: every call carries the
 * session's Bearer token.
 *
 * A 401 used to clear the session and navigate to `/admin/login` immediately,
 * on the reasoning that "an expired or revoked session is not something a
 * retry fixes". Jira GRW-417 made half of that false: an expired session IS
 * now fixable, from the refresh cookie, without the admin typing anything. So
 * a 401 tries that first and replays the request once, and only a session
 * that genuinely cannot be renewed ends in a sign-out. The difference is
 * whatever the admin was in the middle of — before this, a token expiring
 * during a half-filled Add Business form took the form with it.
 */
export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /**
     * The API's own `error` code and the `field` it blamed, when it sent them
     * (GRW-175). Both optional: most routes send neither, and a screen that
     * needs them must handle their absence rather than assume a shape.
     *
     * Added because the Add Business form shows a refusal against the field it
     * is about, and the alternative — matching on message text — breaks the
     * first time someone rewords a sentence.
     */
    public code?: string,
    public field?: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function extractError(res: Response, path: string): Promise<{ message: string; code?: string; field?: string }> {
  const body = (await res.json().catch(() => null)) as { error?: string; detail?: string; field?: string } | null;
  return {
    message: body?.detail ?? body?.error ?? `${path} failed: ${res.status}`,
    code: body?.error,
    field: body?.field,
  };
}

/**
 * One attempt, carrying whatever session is in storage at the moment it runs
 * — which is why the token is read here and not by the caller: the retry below
 * must pick up the token the refresh just wrote, not the expired one.
 *
 * `init` is replayed as given. Every caller in this plane passes a JSON string
 * body or none, so there is no stream here to be consumed by the first attempt.
 */
async function send(path: string, init?: RequestInit): Promise<Response> {
  // Jira GRW-480 (S-10) — no Authorization header: the session is the HttpOnly cookie, sent with this same-origin
  // request by the browser and readable by no script.
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return fetch(`/api/admin/v1${path}`, { ...init, headers, cache: 'no-store' });
}

async function unwrap<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) {
    const { message, code, field } = await extractError(res, path);
    throw new AdminApiError(res.status, message, code, field);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * A 401 that is about what was TYPED, not about the session.
 *
 * Change password answers a wrong current password with 401 `invalid_credentials`. Read as an expired session it
 * was renewed, replayed — a second failed attempt against the sign-in throttle for one typo — and the admin was
 * signed out mid-dialog. The session is fine; the password was wrong. Peeked from a clone so `unwrap` can still
 * read the body for the message.
 */
async function isRefusedCredential(res: Response): Promise<boolean> {
  const body = (await res.clone().json().catch(() => null)) as { error?: string } | null;
  return body?.error === 'invalid_credentials';
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);
  if (res.status !== 401 || (await isRefusedCredential(res))) return unwrap<T>(res, path);

  // Jira GRW-417 — renew, then replay. Once: a second 401 with a token the
  // server has just minted is not an expiry problem, and retrying further
  // would only turn one refused request into a loop.
  const outcome = await refreshAdminSession();
  if (outcome.status === 'renewed') {
    const retried = await send(path, init);
    if (retried.status !== 401) return unwrap<T>(retried, path);
  }

  /**
   * An outage or the throttle is NOT a sign-out.
   *
   * The refresh route is careful never to end a session over a blip, and
   * throwing this away here would undo that from the other end: the session
   * stays exactly as it was, the screen shows its ordinary error state, and
   * the next attempt — this admin retrying, or the background poller — can
   * still renew it. Signing somebody out of a half-finished form because
   * Cognito was briefly unreachable is the complaint this ticket started as.
   */
  if (outcome.status === 'unavailable') {
    throw new AdminApiError(
      503,
      'Could not reach the sign-in service to renew your session. Nothing was lost — please try that again.',
      'session_refresh_unavailable',
    );
  }

  clearAdminSession();
  if (typeof window !== 'undefined') window.location.href = '/admin/login';
  // The redirect above is navigating away; this throw just ends the
  // current call cleanly rather than letting a caller act on no data.
  throw new AdminApiError(401, 'Session expired — signing out.');
}
