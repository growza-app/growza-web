/**
 * Jira GRW-225 — the design's "Busy" / "Slow" pill on each branch.
 *
 * Relative to the business's busiest branch today, because that is the only
 * yardstick an owner of two or three branches actually uses: "Indiranagar is
 * quiet compared to Koramangala". Below SLOW_SHARE of the busiest is Slow.
 *
 * No pill at all when no branch has a booking yet — at opening time every
 * branch is "slow", and saying so is noise.
 */
export type BranchPace = 'busy' | 'slow';

export const SLOW_SHARE = 0.6;

export function branchPace(bookings: number, allBranches: readonly number[]): BranchPace | null {
  const busiest = Math.max(0, ...allBranches);
  if (busiest === 0) return null;
  return bookings < busiest * SLOW_SHARE ? 'slow' : 'busy';
}
