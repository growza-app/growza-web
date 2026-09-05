'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { signOut } from '../lib/sign-out';

/**
 * Jira GRW-66 · GRW-160 — the sign-out control, styled by whoever renders it.
 *
 * `className` and `children` are the caller's, because the three places this
 * appears look nothing alike: a Settings row, a sidebar footer link, a row on
 * the mobile More menu. What they share is the behaviour, which is the part
 * worth having once.
 */
export function SignOutButton({
  className,
  children,
  busyChildren,
}: {
  className?: string;
  children: ReactNode;
  /** Shown while the request is in flight, when the caller has room to say so. */
  busyChildren?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      className={className}
      type="button"
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        // Stays true: the page is about to be replaced, and re-enabling the
        // button in between would offer a second click that does nothing.
        await signOut();
      }}
    >
      {busy && busyChildren ? busyChildren : children}
    </button>
  );
}
