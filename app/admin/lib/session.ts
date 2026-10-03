/**
 * The admin plane's own session storage (GRW-99's login prerequisite).
 *
 * sessionStorage, not localStorage: an admin console with cross-tenant reach
 * is exactly the surface where "signed out when the tab closes" is the
 * right default, not an inconvenience. Nothing here talks to Cognito
 * directly — the token comes from `POST /auth/login` (src/api/admin-routes.ts)
 * and every other admin call just carries it as a Bearer header.
 */
const STORAGE_KEY = 'growza-admin-session';

/**
 * Jira GRW-480 (S-10) — when the session ends, and nothing else. The token itself is an HttpOnly cookie the API
 * sets; this page never sees it, so no script on it can take it. What is kept here is only enough to know whether
 * the portal is signed in and when to refresh.
 */
export interface AdminSession {
  expiresAt: string;
}

/*
 * Jira GRW-476 — the admin bearer token lives in memory, not in sessionStorage.
 *
 * Stored, it was a cross-business admin token any script running on the page could read back at any time, and
 * outlived the page that minted it. In memory it is gone on reload; the gate then re-mints one from the HttpOnly,
 * path-scoped refresh cookie (GRW-417), which no script can read. Any value an older build left in
 * sessionStorage is removed the first time this module runs.
 */
let current: AdminSession | null = null;
if (typeof window !== 'undefined') {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked — nothing was stored there either.
  }
}

export function readAdminSession(): AdminSession | null {
  if (!current) return null;
  if (new Date(current.expiresAt).getTime() <= Date.now()) {
    clearAdminSession();
    return null;
  }
  return current;
}

export function writeAdminSession(session: AdminSession): void {
  current = session;
}

export function clearAdminSession(): void {
  current = null;
}
