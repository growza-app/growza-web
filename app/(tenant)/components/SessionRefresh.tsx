'use client';

import { useVisibleInterval } from './useVisibleInterval';

/**
 * Jira GRW-304 — keeps an actively-used dashboard tab signed in.
 *
 * The Cognito ID token behind the session cookie lives for about an hour;
 * without this, someone working a counter gets an unannounced logout mid-task
 * the moment it runs out. `POST /api/v1/auth/refresh` reads a second,
 * narrowly-scoped cookie and mints a fresh session — this component's only
 * job is calling that route often enough that the visible tab never reaches
 * the hard cutoff. A failed call needs no handling here: the existing
 * `shouldSignInAgain` → redirect path in `layout.tsx` already covers the next
 * real navigation once refresh genuinely stops working (an idle tab past the
 * refresh cookie's own ~30-day window, or the account no longer able to sign
 * in at all).
 */
const REFRESH_INTERVAL_MS = 15 * 60_000;

export function SessionRefresh() {
  useVisibleInterval(() => {
    void fetch('/api/v1/auth/refresh', { method: 'POST' });
  }, REFRESH_INTERVAL_MS);

  return null;
}
