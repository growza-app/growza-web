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

export interface AdminSession {
  token: string;
  expiresAt: string;
}

export function readAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'string') return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      clearAdminSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeAdminSession(session: AdminSession): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearAdminSession(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
}
