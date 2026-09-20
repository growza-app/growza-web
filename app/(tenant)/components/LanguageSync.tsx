'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { decideLangSync, getPendingLang, putLang, rememberLang, setPendingLang, type Lang } from '../lib/lang';

/**
 * Jira GRW-329 — keeps the cookie and the person's stored language in step.
 *
 * The cookie is what a server render is resolved from; the account is what
 * survives a new device. Sign-in and refresh already write one from the other
 * (`languageCookie`, api/security/session-cookie.ts), so ordinarily this has
 * nothing to do. It exists for what those two cannot reach — see
 * `decideLangSync` for the rules and, more to the point, for why each one is
 * there: the order of its branches is the fix for three separate bugs QA found
 * in the first version of this component.
 *
 * `stored` is the account's value, from `/api/v1/me`; `rendered` is what this
 * page was actually drawn in. The refresh below is rare and cannot loop: it
 * re-renders with the cookie now matching, and the next pass finds them equal.
 */
export function LanguageSync({ stored, rendered }: { stored?: string | null; rendered: Lang }) {
  const router = useRouter();

  useEffect(() => {
    const pending = getPendingLang();
    const action = decideLangSync({ stored, rendered, pending });
    if (action.kind === 'none') return;

    if (action.kind === 'clear-pending') {
      setPendingLang(null);
      return;
    }
    if (action.kind === 'set-cookie') {
      rememberLang(action.lang);
      router.refresh();
      return;
    }
    // 'push' — retry a save that never landed, or adopt a Hindi choice made
    // before choices lived on the account. Deliberately no refresh: the screen
    // is already right, only the record is behind.
    void putLang(action.lang).then((ok) => {
      if (ok && pending === action.lang && getPendingLang() === action.lang) setPendingLang(null);
    });
  }, [stored, rendered, router]);

  return null;
}
