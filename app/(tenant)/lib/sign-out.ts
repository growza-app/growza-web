import { SIGN_IN_PATH } from './session-policy';

/**
 * Jira GRW-66 · GRW-160 — ending a session, in one place.
 *
 * Three surfaces offer it (the Settings row, the desktop sidebar, the mobile
 * More menu) because a session only one of them can end is a session a stylist
 * on a shared salon device cannot end at all. Three copies of this function is
 * how two of them would end up subtly different.
 *
 * A full page load, not `router.replace()`. Two reasons, and the first is the
 * one that bit: `router.refresh()` followed by `router.replace()` raced, and the
 * refresh won — the click cleared the cookie and left the owner looking at the
 * dashboard, apparently still signed in. The second is why this is the right
 * answer rather than a workaround: crossing a session boundary should drop every
 * client-side cached render, and `location.assign` does that by construction,
 * where `refresh()` only approximates it.
 */
export async function signOut(): Promise<void> {
  try {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
  } catch {
    /**
     * Leave anyway.
     *
     * A failed request does not mean the session survived, and leaving somebody
     * signed in because the network blipped is the wrong way to be wrong about
     * logging out. If the cookie really did survive, the sign-in screen is
     * still the right place to be.
     */
  }
  window.location.assign(SIGN_IN_PATH);
}
