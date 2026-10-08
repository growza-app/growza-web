'use client';

import { useEffect } from 'react';
import { resumeSession } from '../lib/resume-session';
import { SIGN_IN_PATH } from '../lib/session-policy';

/**
 * Rendered in place of the shell when `/me` says 401 — the one screen between a lapsed session and the sign-in form.
 *
 * The layout cannot do this itself: it is a server component, and setting a cookie needs a response it does not own.
 * So the 401 path renders this instead of redirecting, and it asks the refresh route the question the redirect never
 * asked. On a success the page is reloaded and the owner never learns anything happened; on anything else they go to
 * /login exactly as before.
 *
 * Nothing is drawn while it runs, deliberately: the redirect this replaces also showed a blank, so the quiet path
 * costs no flash of a screen that is about to be replaced — and a person who really is signed out sees no sentence
 * claiming they are being signed in.
 */
export function SessionResume() {
  useEffect(() => {
    let cancelled = false;
    void resumeSession().then((resumed) => {
      if (cancelled) return;
      /*
       * `location.replace`, not `router.refresh()`: the server render that 401ed is cached, and only a full load is
       * guaranteed to discard it (the same reasoning as sign-out and sign-in). `replace` so neither outcome leaves
       * this blank screen in the history for Back to return to.
       */
      if (resumed) window.location.replace(window.location.href);
      else window.location.replace(SIGN_IN_PATH);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
