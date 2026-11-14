'use client';

import { useSession } from './SessionProvider';

/**
 * Emerald v3 (owner, 14 Nov 2026: "move [the business] and add growza logo there") — on a laptop the business and
 * its branch sit in the header bar, and the sidebar's top carries the Growza mark. CSS shows this at 861px and up
 * only; the phone keeps the business at the top of its drawer, as before.
 *
 * An owner of several branches has the branch pill beside this, so the line under the name is left off.
 */
export function HeaderBusiness() {
  const session = useSession();
  const name = session?.businessName?.trim();
  if (!name) return null;
  return (
    <div className="hdr-biz">
      <span className="hdr-biz-badge" aria-hidden="true">
        {Array.from(name)[0]!.toUpperCase()}
      </span>
      <span className="hdr-biz-text">
        <strong>{name}</strong>
        {session?.locationName ? <span>{session.locationName}</span> : null}
      </span>
    </div>
  );
}
