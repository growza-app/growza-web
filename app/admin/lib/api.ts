import { clearAdminSession, readAdminSession } from './session';

/**
 * The admin plane's fetch wrapper (GRW-99) — same-origin `/api/admin/v1/...`
 * through Next's rewrite (next.config.ts), same shape as the tenant portal's
 * own `lib/api.ts`. The one thing that differs: every call carries the
 * session's Bearer token, and a 401 clears it and sends the admin back to
 * `/admin/login` rather than surfacing as a generic error — an expired or
 * revoked session is not something a retry fixes.
 */
export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function extractErrorMessage(res: Response, path: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
  return body?.detail ?? body?.error ?? `${path} failed: ${res.status}`;
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const session = readAdminSession();
  const headers = new Headers(init?.headers);
  if (session) headers.set('Authorization', `Bearer ${session.token}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`/api/admin/v1${path}`, { ...init, headers, cache: 'no-store' });

  if (res.status === 401) {
    clearAdminSession();
    if (typeof window !== 'undefined') window.location.href = '/admin/login';
    // The redirect above is navigating away; this throw just ends the
    // current call cleanly rather than letting a caller act on no data.
    throw new AdminApiError(401, 'Session expired — signing out.');
  }

  if (!res.ok) throw new AdminApiError(res.status, await extractErrorMessage(res, path));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
