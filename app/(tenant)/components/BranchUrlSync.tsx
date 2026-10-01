'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useBranch } from './BranchProvider';
import { useSession } from './SessionProvider';
import { ALL_BRANCHES_PARAM, urlSyncAction } from '../lib/branch-url-sync';

/**
 * Jira GRW-376 · GRW-377 — keeps a server-rendered screen's `?branch=` and the shared branch context agreeing.
 *
 * Reports and Availability are drawn on the server from the address, which cannot see the branch the person
 * chose on another screen. So on arrival with no `?branch=`, this puts the remembered branch into the address
 * (the page redraws for it); and when the address does name one — a link, a picker on this screen — it becomes
 * the remembered branch for every other screen. `?branch=all` is how "all branches" is said explicitly, so a
 * deliberate "all" is not mistaken for a fresh arrival and redirected back to a branch.
 *
 * Renders nothing.
 */
export function BranchUrlSync({ param = 'branch', remember = true }: { param?: string; remember?: boolean }) {
  const branch = useBranch();
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const inAddress = params.get(param);
  // Reports and Availability honour `?branch=` for owners only (product decision 2026-09-14); a null role is a
  // degraded session and is treated as owner (BR-03). For anyone else a redirect only redraws the same page —
  // QA measured 3–4 server fetches per visit for a manager — so there is nothing to sync.
  const honoured = (session?.role ?? 'owner') === 'owner';

  useEffect(() => {
    if (!honoured || !branch.ready || !branch.multi || branch.pinned) return;
    const action = urlSyncAction(inAddress, branch.choice);
    if (action.kind === 'remember' && action.branch !== null && !branch.branches.some((b) => b.id === action.branch)) {
      // A closed branch or a mistyped id in a link: the address is put back to the branch already chosen, so the
      // screen, the header and every other screen agree — remembering it reset the whole app to "all" (GRW-396 QA).
      const query = new URLSearchParams(params.toString());
      query.set(param, branch.choice ?? ALL_BRANCHES_PARAM);
      router.replace(`${pathname}?${query.toString()}`);
      return;
    }
    if (action.kind === 'remember') {
      // Follow-only screens take the shared branch but never set it. Availability is one: it cannot show "all",
      // so its form always submits a branch, and remembering that silently undid an "all branches" chosen
      // elsewhere when the owner only changed the date (QA).
      if (remember) branch.setBranch(action.branch);
    }
    else if (action.kind === 'redirect') {
      const query = new URLSearchParams(params.toString());
      query.set(param, action.branch);
      router.replace(`${pathname}?${query.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.ready, inAddress]);

  return null;
}

export { ALL_BRANCHES_PARAM };
