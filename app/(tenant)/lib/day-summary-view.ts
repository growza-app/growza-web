/**
 * Jira GRW-450 — the two rules the end-of-day readout follows once a business has more than one branch.
 *
 * Both are one line each and both are here rather than inline, because each is a claim the screen makes about
 * a branch and each was wrong in a way nobody could see from reading the component.
 */

export interface BranchRef {
  id: string;
  name: string;
}

/**
 * The branch to name beside a stylist, or null for no tag at all.
 *
 * A tag only earns its place while branches are MIXED. On one branch's own summary every row would carry the
 * branch already written at the top of the sheet — a column of the same word, which is how a list stops being
 * read. On "All branches" it is the difference between two stylists called Priya and one list of strangers.
 *
 * A row that names no branch (the no-stylist row) gets no tag rather than the first branch in the list: its
 * visits can span branches, so any name here would be a guess.
 */
export function branchTag(locationId: string | null | undefined, branches: ReadonlyArray<BranchRef> | undefined): string | null {
  if (!branches || branches.length < 2 || !locationId) return null;
  return branches.find((b) => b.id === locationId)?.name ?? null;
}

/**
 * The closing time the screen may claim, or null when it may not claim one.
 *
 * On "All branches" there is no such time. Branches set their own hours, so the business-level `working_hours`
 * row the API falls back to can name a time no branch closed at — while another branch is still open and
 * serving. "Day closed at 8:00 pm" above three branches is a fact about none of them.
 */
export function closingTime(closesAt: string | null | undefined, onAllBranches: boolean): string | null {
  if (onAllBranches) return null;
  return closesAt ?? null;
}
