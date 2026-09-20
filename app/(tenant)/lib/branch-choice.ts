/**
 * Jira GRW-340 — the branch an owner is looking at, kept for the session so Home, Bookings and Attendance open on
 * the same tab instead of each starting on "All".
 *
 * `sessionStorage`, not `localStorage`: it is a working choice, not a preference. A new visit starts on "All" the
 * way it always has, and a shared tablet does not open on the last person's branch tomorrow. Every read is checked
 * against the branches the business has open NOW — a branch that has since closed reads as "All", never as an
 * empty branch — and every access is wrapped, since storage can be blocked or throw.
 */
const KEY = 'growza_branch_choice';

export function readBranchChoice(open: ReadonlyArray<{ id: string }>): string | null {
  try {
    const id = window.sessionStorage.getItem(KEY);
    return id && open.some((b) => b.id === id) ? id : null;
  } catch {
    return null;
  }
}

export function writeBranchChoice(id: string | null): void {
  try {
    if (id) window.sessionStorage.setItem(KEY, id);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* the choice just does not carry over */
  }
}
