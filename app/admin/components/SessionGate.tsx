'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { refreshAdminSession } from '../lib/refresh';
import { readAdminSession } from '../lib/session';
import { AdminShell } from './AdminShell';
import { AdminMeProvider } from './AdminMeContext';
import { SessionRefresh } from './SessionRefresh';

const LOGIN_PATH = '/admin/login';

/**
 * The admin plane's session boundary (GRW-99's login prerequisite).
 *
 * `/admin/login` renders raw — no sidebar, no header, nothing implying the
 * visitor already has access. It is also where a first password is set
 * (GRW-165), which is why that needs no route of its own. Everything else requires a session already in
 * sessionStorage or redirects there first; AdminShell only ever wraps a page
 * an authenticated admin is allowed to see.
 *
 * A client check, not a server one: the session lives in memory (GRW-476),
 * which only the browser can read. This is a UX gate, not the security
 * boundary — that boundary is GRW-94's guard on every API call itself, which
 * an admin cannot get past no matter what this component does or doesn't do.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const isLoginPage = pathname === LOGIN_PATH;

  useEffect(() => {
    if (isLoginPage) {
      setReady(true);
      return;
    }
    if (readAdminSession()) {
      setReady(true);
      return;
    }

    /**
     * Jira GRW-417 — no readable session is not the same as no session.
     *
     * `readAdminSession()` returns null for an EXPIRED token as well as a
     * missing one, and clears it on the way out. Until this, that meant an
     * admin who reloaded the tab an hour after signing in — or came back to
     * one their laptop had slept through — was sent to `/admin/login` while a
     * perfectly good refresh cookie sat in the browser unused. That is the
     * logout this ticket was opened about, and the background poller alone
     * does not close it: it only ever runs in a tab that stayed awake.
     *
     * Nothing is rendered while this is in flight, which is the same blank the
     * redirect case already showed.
     */
    let cancelled = false;
    void refreshAdminSession().then((outcome) => {
      if (cancelled) return;
      if (outcome.status === 'renewed') setReady(true);
      else router.replace(LOGIN_PATH);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoginPage, pathname, router]);

  if (isLoginPage) return <>{children}</>;
  // Nothing rendered while the redirect resolves — avoids a flash of the
  // sidebar shell for a visitor about to be sent to /admin/login anyway.
  if (!ready) return null;
  return (
    <>
      {/* Jira GRW-417 — only mounted once there is a session for it to renew. */}
      <SessionRefresh />
      {/* Batch D — /me read once here, for the shell's nav and every screen's controls alike. */}
      <AdminMeProvider>
        <AdminShell>{children}</AdminShell>
      </AdminMeProvider>
    </>
  );
}
