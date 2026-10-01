/**
 * Jira GRW-376 · GRW-377 — which branch the dashboard is looking at, decided in one place.
 *
 * Until now every screen answered this for itself: Bookings, Attendance and Home each read and wrote the
 * session's choice (`branch-choice.ts`), Reports and Availability read a `?branch=` from the address, and the
 * walk-in sheet and the staff wizard kept their own `useState`. They agreed only by accident. A per-branch
 * catalogue (GRW-378) cannot be built on that: the Services screen has to show the same branch the diary does.
 *
 * These are the rules, as pure functions so they can be tested without a browser; `BranchProvider` holds the
 * state and hands this result to every screen.
 */

export interface BranchRef {
  id: string;
  name: string;
}

export interface BranchState {
  /** The business's open branches, main first — as `/me` returns them. */
  branches: BranchRef[];
  /** More than one open branch: the only case in which there is anything to choose. */
  multi: boolean;
  /**
   * Fixed to one branch and not allowed to change it — a receptionist or stylist whose membership names a
   * branch. A receptionist whose branch is null works at every branch (GRW-237) and is not pinned.
   */
  pinned: boolean;
  /**
   * The branch picked, or null for "all branches". Null is only possible for someone who may see every branch
   * at a business that has several; a pinned person and a one-branch business always have a branch here.
   */
  choice: string | null;
  /**
   * Exactly one branch, for a screen that cannot show "all" — a catalogue, a booking, a till. The choice when
   * there is one, otherwise the main branch. Null only for a business with no open branch at all.
   */
  one: string | null;
}

export interface BranchInputs {
  branches: ReadonlyArray<BranchRef>;
  role: string | null;
  /** The member's own branch from `/me` — a receptionist's stored branch, a stylist's provider's branch. */
  memberLocationId: string | null;
  /** What the person asked for: the remembered choice, an address's `?branch=`, or a tap on a picker. */
  wanted: string | null;
}

/** Roles whose membership, when it names a branch, fixes them to it. Owners and managers choose freely. */
const PINNABLE_ROLES = new Set(['receptionist', 'staff']);

export function resolveBranchState(input: BranchInputs): BranchState {
  const branches = [...input.branches];
  const isOpen = (id: string | null): id is string => id !== null && branches.some((b) => b.id === id);
  const main = branches[0]?.id ?? null;
  const multi = branches.length > 1;

  const pinned = input.role !== null && PINNABLE_ROLES.has(input.role) && isOpen(input.memberLocationId);

  let choice: string | null;
  if (pinned) choice = input.memberLocationId;
  // One branch: there is nothing to choose, and "all" and "this one" are the same thing — answer the branch.
  else if (!multi) choice = main;
  // A closed or foreign branch reads as "all", never as an empty screen (BR-01, and GRW-340 before it).
  else choice = isOpen(input.wanted) ? input.wanted : null;

  return { branches, multi, pinned, choice, one: choice ?? main };
}

/**
 * What a request to change branch actually results in. A pinned person, or a one-branch business, cannot
 * move: the request is ignored rather than refused, because a picker is never shown to them in the first place.
 */
export function nextChoice(state: BranchState, requested: string | null): string | null {
  if (state.pinned || !state.multi) return state.choice;
  return requested !== null && state.branches.some((b) => b.id === requested) ? requested : null;
}
