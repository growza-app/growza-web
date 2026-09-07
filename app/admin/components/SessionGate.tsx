'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { readAdminSession } from '../lib/session';
import { AdminShell } from './AdminShell';

const LOGIN_PATH = '/admin/login';

/**
 * GRW-164 — accepting an invitation is the other screen with no session.
 *
 * A prefix rather than an exact path, because the token is in the URL. Without
 * this the gate sends the invitee to /admin/login — a sign-in form for the
 * account they are here to create, which is the same deadlock GRW-183 hit on
 * the tenant plane: the only route to having access was refused for not having
 * it yet.
 */
const JOIN_PREFIX = '/admin/join/';

/**
 * The admin plane's session boundary (GRW-99's login prerequisite).
 *
 * `/admin/login` and `/admin/join/<token>` render raw — no sidebar, no header,
 * nothing implying the visitor already has access. Everything else requires a session already in
 * sessionStorage or redirects there first; AdminShell only ever wraps a page
 * an authenticated admin is allowed to see.
 *
 * A client check, not a server one: the session lives in sessionStorage,
 * which only the browser can read. This is a UX gate, not the security
 * boundary — that boundary is GRW-94's guard on every API call itself, which
 * an admin cannot get past no matter what this component does or doesn't do.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const isPublicPage = pathname === LOGIN_PATH || pathname.startsWith(JOIN_PREFIX);

  useEffect(() => {
    if (isPublicPage) {
      setReady(true);
      return;
    }
    if (!readAdminSession()) {
      router.replace(LOGIN_PATH);
      return;
    }
    setReady(true);
  }, [isPublicPage, pathname, router]);

  if (isPublicPage) return <>{children}</>;
  // Nothing rendered while the redirect resolves — avoids a flash of the
  // sidebar shell for a visitor about to be sent to /admin/login anyway.
  if (!ready) return null;
  return <AdminShell>{children}</AdminShell>;
}
