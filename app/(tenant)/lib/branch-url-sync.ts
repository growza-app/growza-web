/**
 * Jira GRW-376 · GRW-377 — what to do when a server-drawn screen's address and the shared branch choice meet.
 * Pure, so the three cases are tested without a router; `components/BranchUrlSync.tsx` carries them out.
 */

/** How "all branches" is written in an address, so it is never confused with "no branch named yet". */
export const ALL_BRANCHES_PARAM = 'all';

export type UrlSyncAction =
  /** The address named a branch (or "all"): that becomes the choice every other screen opens on. */
  | { kind: 'remember'; branch: string | null }
  /** The address named nothing and a branch was chosen elsewhere: put it in the address. */
  | { kind: 'redirect'; branch: string }
  | { kind: 'none' };

export function urlSyncAction(inAddress: string | null, remembered: string | null): UrlSyncAction {
  if (inAddress === ALL_BRANCHES_PARAM) return { kind: 'remember', branch: null };
  if (inAddress) return { kind: 'remember', branch: inAddress };
  if (remembered) return { kind: 'redirect', branch: remembered };
  return { kind: 'none' };
}
