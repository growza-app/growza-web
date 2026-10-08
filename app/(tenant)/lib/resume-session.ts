/**
 * Trading the 30-day refresh cookie for a fresh session, after a 401.
 *
 * The session cookie lasts about an hour, and only a visible, open tab renews it (`SessionRefresh`). Close the app
 * for longer than that and the next page load meets a lapsed cookie and a 401 from `/me`, while the refresh cookie,
 * good for 30 days, sits unused beside it because nothing on a page load ever tries it. This is that missing try.
 *
 * **Deliberately NOT on the sign-in page.** That was the first shape of this fix and it was wrong twice over: a
 * sign-out whose logout call failed to clear the cookies would be resumed straight back into the account it had just
 * left, and a second person on a shared reception tablet could never reach the form at all. The admin plane already
 * learned this in GRW-417 — `SessionGate` refreshes on the protected pages and skips its own login page — and this
 * follows it. Arriving at /login is a decision; meeting a 401 on a dashboard page is an accident, and only the
 * accident is worth mending silently.
 *
 * It needs no cookie change: the browser already sends the refresh cookie to this one route, and a request our own
 * page makes is same-site, so it goes out even when the visit began from a link in WhatsApp (the session cookie is
 * `SameSite=Strict` and did not).
 *
 * `true` means a session now exists and the caller should reload. Every other outcome — no cookie, an expired one,
 * the account refused, an outage, a slow network — is `false` and means the sign-in screen, because none of them can
 * be helped from here.
 */

/** The attempt in flight, shared. React runs a mount effect twice in development; two POSTs would be one question asked twice. */
let inFlight: Promise<boolean> | null = null;

/** A refresh that worked, and when. Read back by the loop guard below. */
const RESUMED_AT = 'growza.resumed-at';
/** How long a success blocks another. Long enough to catch a reload loop, short enough never to touch a person. */
const LOOP_WINDOW_MS = 30_000;
/** A hung request must not strand somebody on a blank screen with no way to the form. */
const GIVE_UP_MS = 4_000;

export type ResumeDeps = {
  fetch: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  now: () => number;
};

function browserDeps(): ResumeDeps {
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    // Blocked storage (a private window with site data off). Without it the guard below cannot work, and it fails open.
  }
  return { fetch: (...args) => window.fetch(...args), storage, now: Date.now };
}

export function resumeSession(deps?: ResumeDeps): Promise<boolean> {
  inFlight ??= attempt(deps ?? browserDeps()).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function attempt({ fetch, storage, now }: ResumeDeps): Promise<boolean> {
  /*
   * The loop guard. If a refresh succeeded a moment ago and `/me` is 401ing again, the session it minted did not
   * take (a cookie the browser dropped, a clock too far out for the token to verify). Reloading again would bounce
   * between here and the dashboard forever, so the second arrival goes to the sign-in screen instead.
   */
  try {
    const last = Number(storage?.getItem(RESUMED_AT));
    if (Number.isFinite(last) && last > 0 && now() - last < LOOP_WINDOW_MS) return false;
  } catch {
    /* unreadable storage: no guard, which is the same position this page was in before */
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GIVE_UP_MS);
  try {
    const res = await fetch('/api/v1/auth/refresh', { method: 'POST', cache: 'no-store', signal: controller.signal });
    if (!res.ok) return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }

  try {
    storage?.setItem(RESUMED_AT, String(now()));
  } catch {
    /* as above */
  }
  return true;
}
