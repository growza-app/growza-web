'use client';

import { useSession } from './SessionProvider';
import { useBranch } from './BranchProvider';
import { HeaderBranchPicker } from './HeaderBranchPicker';

/**
 * Emerald v3 (owner, 14 Nov 2026: "move [the business] and add growza logo there") — on a laptop the business and
 * its branch sit in the header bar, and the sidebar's top carries the Growza mark. CSS shows this at 861px and up
 * only; the phone keeps the business at the top of its drawer, as before.
 *
 * An owner of several branches picks the branch here: the line under the name is the branch picker, and the
 * header's separate branch pill is hidden on a laptop (owner, 14 Nov 2026: one control, not two). A tap anywhere
 * on the chip opens it.
 */
export function HeaderBusiness() {
  const session = useSession();
  const branch = useBranch();
  const name = session?.businessName?.trim();
  if (!name) return null;
  return (
    <div className={`hdr-biz${branch.multi && !branch.pinned ? ' has-picker' : ''}`}>
      <span className="hdr-biz-badge" aria-hidden="true">
        {Array.from(name)[0]!.toUpperCase()}
      </span>
      <span className="hdr-biz-text">
        <strong>{name}</strong>
        {branch.multi && !branch.pinned ? <HeaderBranchPicker variant="chip" /> : session?.locationName ? <span>{session.locationName}</span> : null}
      </span>
    </div>
  );
}
