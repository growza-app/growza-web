'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { readAdminSession } from '../lib/session';
import { AdminShell } from './AdminShell';

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
 * A client check, not a server one: the session lives in sessionStorage,
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
    if (!readAdminSession()) {
      router.replace(LOGIN_PATH);
      return;
    }
    setReady(true);
  }, [isLoginPage, pathname, router]);

  if (isLoginPage) return <>{children}</>;
  // Nothing rendered while the redirect resolves — avoids a flash of the
  // sidebar shell for a visitor about to be sent to /admin/login anyway.
  if (!ready) return null;
  return <AdminShell>{children}</AdminShell>;
}
