'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useVisibleInterval } from '../../(tenant)/components/useVisibleInterval';
import { refreshAdminSession } from '../lib/refresh';
import { readAdminSession } from '../lib/session';

/**
 * Jira GRW-417 — keeps an actively-used admin console tab signed in, the same
 * way `(tenant)/components/SessionRefresh.tsx` does for the salon dashboard
 * (GRW-304). The platform Cognito id token behind the bearer session lives
 * for about an hour; without this, an administrator working a support ticket
 * reaches that cutoff mid-task.
 *
 * This is the PROACTIVE half only. Recovering a session that has already
 * expired belongs to `SessionGate` (a page load) and `adminFetch` (a 401),
 * which both renew from the same cookie — so a tab this component never got
 * to poll is not a tab that loses its session.
 */
const REFRESH_INTERVAL_MS = 15 * 60_000;

/**
 * Renew only once the token has less than this left: one poll interval plus a
 * margin, so there is always a tick to spare before the ~60-minute expiry.
 *
 * The check is the point, not an optimisation. `useVisibleInterval` also fires
 * on every `visibilitychange`, so without it an admin switching between tabs
 * twenty times would spend twenty Cognito `InitiateAuth` calls renewing a
 * token with fifty minutes left — and Cognito throttles that flow per user,
 * so the burst can make the refresh start failing on its own.
 */
const RENEW_WITHIN_MS = 20 * 60_000;

export function SessionRefresh() {
  /**
   * A refusal the server attributed to the cookie is not retried.
   *
   * Every attempt charges the login throttle's per-caller budget (GRW-161),
   * and that budget gates `/auth/login` for the whole caller address and is
   * deliberately never cleared by a success. A poller that kept hammering a
   * dead refresh token would therefore lock its own administrator — and
   * anyone sharing their address — out of the sign-in screen they were just
   * sent to.
   */
  const refused = useRef(false);

  const renewIfDue = useCallback(() => {
    if (refused.current) return;

    /**
     * A null session here means the token already expired (and was cleared on
     * read). Worth one attempt rather than nothing: `refreshAdminSession`
     * shares a single in-flight request, so racing `SessionGate` costs no
     * second call.
     */
    const session = readAdminSession();
    if (session && Date.parse(session.expiresAt) - Date.now() > RENEW_WITHIN_MS) return;

    void refreshAdminSession().then((outcome) => {
      if (outcome.status === 'dead') refused.current = true;
    });
  }, []);

  // At mount as well as on the interval: a tab reloaded with ten minutes of
  // token left would otherwise wait fifteen for its first attempt and expire
  // before making one.
  useEffect(() => {
    renewIfDue();
  }, [renewIfDue]);

  useVisibleInterval(renewIfDue, REFRESH_INTERVAL_MS);

  return null;
}
