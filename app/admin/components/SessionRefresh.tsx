'use client';

import { useVisibleInterval } from '../../(tenant)/components/useVisibleInterval';
import { writeAdminSession } from '../lib/session';

/**
 * Jira GRW-417 — keeps an actively-used admin console tab signed in, the same
 * way `(tenant)/components/SessionRefresh.tsx` does for the salon dashboard
 * (GRW-304). The platform Cognito id token behind the bearer session lives
 * for about an hour; without this, an administrator working a support ticket
 * gets an unannounced logout mid-task the moment it runs out, because
 * `adminFetch`'s 401 handling (`lib/api.ts`) treats every 401 as final.
 *
 * `POST /api/admin/v1/auth/refresh` reads a narrowly-scoped `HttpOnly` cookie
 * — separate from the bearer token this plane keeps in `sessionStorage` — and
 * mints a fresh id token. This component's only job is calling that route
 * often enough that the visible tab never reaches the hard cutoff, and
 * writing the renewed token back into the session the rest of the admin
 * plane already reads. A failed call needs no handling here: the next
 * `adminFetch` call still 401s and `SessionGate` still sends the admin to
 * `/admin/login`, exactly as it did before this component existed.
 */
const REFRESH_INTERVAL_MS = 15 * 60_000;

export function SessionRefresh() {
  useVisibleInterval(() => {
    void fetch('/api/admin/v1/auth/refresh', { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { token?: string; expiresAt?: string } | null) => {
        if (body?.token && body.expiresAt) writeAdminSession({ token: body.token, expiresAt: body.expiresAt });
      })
      .catch(() => {});
  }, REFRESH_INTERVAL_MS);

  return null;
}
