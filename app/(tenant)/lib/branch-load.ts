import { resolveBranchState, type BranchState } from './branch-context';
import { ALL_BRANCHES_PARAM } from './branch-url-sync';

/** The parts of `/me` the branch rules read. */
interface MeBranches {
  branches?: Array<{ id: string; name: string }>;
  member?: { role?: string | null; locationId?: string | null } | null;
}

/**
 * Jira GRW-397 — a server-drawn screen's data for its branch, fetched ALONGSIDE `/me` rather than after it.
 *
 * Clients and Offers waited for `/me` to say which branch to load, then loaded it: two round trips in a row on
 * every visit. The address's `?branch=` is the answer almost every time, so the data is asked for with it at once;
 * `/me` then says whether that was right (a closed branch or "all" reads as every branch, a receptionist or
 * stylist is held to their own), and only when it was not is the data asked for again.
 */
export async function loadAtBranch<T, M extends MeBranches>(
  wanted: string | undefined,
  me: Promise<M | null>,
  load: (branch: string | null) => Promise<T>,
): Promise<{ me: M | null; branch: BranchState | null; data: T }> {
  const guess = wanted && wanted !== ALL_BRANCHES_PARAM ? wanted : null;
  const [who, first] = await Promise.all([
    me,
    load(guess).then(
      (data) => ({ ok: true as const, data }),
      () => ({ ok: false as const }),
    ),
  ]);
  const branch = who
    ? resolveBranchState({
        branches: who.branches ?? [],
        role: who.member?.role ?? null,
        memberLocationId: who.member?.locationId ?? null,
        wanted: wanted ?? null,
      })
    : null;
  const choice = branch?.choice ?? null;
  // The server holds a pinned member to their own branch when none is named, and a one-branch business's
  // "every branch" is its one branch: the same data either way.
  const same = choice === guess || (guess === null && branch !== null && (branch.pinned || !branch.multi));
  const data = first.ok && same ? first.data : await load(choice);
  return { me: who, branch, data };
}
