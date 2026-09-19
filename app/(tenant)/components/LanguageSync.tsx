'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { rememberLang, toLang, type Lang } from '../lib/lang';

/**
 * Jira GRW-329 — puts the person's stored language back in the cookie.
 *
 * The cookie is what next-intl resolves a server render from, and the account
 * is what survives a new device. Sign-in and refresh already write one from the
 * other (`languageCookie`, api/security/session-cookie.ts), so in the ordinary
 * case this has nothing to do. It exists for the case those two cannot reach:
 * a cookie cleared in the middle of a long-lived session, where the person is
 * still signed in — the session cookie outlives a "clear cookies" only in the
 * sense that they may clear one and not the other, and browsers expiring
 * individual cookies is ordinary. Without this, the dashboard would quietly
 * revert to English until the next refresh cycle.
 *
 * `stored` is the account's value, from `/api/v1/me`; `rendered` is what this
 * page was actually drawn in. They differ only when the cookie has been lost or
 * overwritten, so the refresh below is rare and cannot loop: it re-renders with
 * the cookie now matching, and the next pass finds them equal.
 */
export function LanguageSync({ stored, rendered }: { stored?: string | null; rendered: Lang }) {
  const router = useRouter();

  useEffect(() => {
    if (!stored) return;
    const want = toLang(stored);
    if (want === rendered) return;
    rememberLang(want);
    router.refresh();
  }, [stored, rendered, router]);

  return null;
}
