'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { nextChoice, resolveBranchState, type BranchRef, type BranchState } from '../lib/branch-context';
import { readBranchChoice, writeBranchChoice } from '../lib/branch-choice';

/**
 * Jira GRW-376 · GRW-377 — the one answer to "which branch is this dashboard looking at?".
 *
 * Every screen that shows a branch reads it from here, so a choice made on Bookings is the branch the Services
 * screen opens on, and a receptionist is fixed to their own branch everywhere at once rather than per screen.
 * The rules live in `lib/branch-context.ts`; this only holds the state.
 *
 * `ready` is false for the server render and the first client render. The session's remembered choice is in
 * the browser's storage, which the server cannot read, so both renders start from the same place ("all", or
 * the pinned/only branch) and the remembered branch arrives one tick later. A screen that loads data per
 * branch should wait for `ready` before loading on the remembered choice.
 */
export interface BranchContextValue extends BranchState {
  ready: boolean;
  /** Ask for a branch, or null for all. Ignored where the person may not choose (pinned, or one branch). */
  setBranch: (id: string | null) => void;
  /**
   * Jira GRW-395 — whether the header's branch picker is open. Held here, not in the picker, so a screen can open
   * it: the money card's "+2 more branches" opens the one picker instead of a second one of its own.
   */
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  /**
   * Jira GRW-395 — the branch a receptionist or stylist is held to, named, when the business has several
   * (`/me`'s `member.locationName`). Their own `branches` is just that one since GRW-393, so `multi` cannot say
   * whether there is anything to name.
   */
  workBranchName: string | null;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({
  branches,
  role,
  memberLocationId,
  workBranchName = null,
  children,
}: {
  branches: ReadonlyArray<BranchRef>;
  role: string | null;
  memberLocationId: string | null;
  workBranchName?: string | null;
  children: ReactNode;
}) {
  const [wanted, setWanted] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setWanted(readBranchChoice(branches));
    setReady(true);
    // The branch list is fixed for the life of this render tree (the layout re-renders it on navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = useMemo(
    () => resolveBranchState({ branches, role, memberLocationId, wanted }),
    [branches, role, memberLocationId, wanted],
  );

  const setBranch = useCallback(
    (id: string | null) => {
      const next = nextChoice(state, id);
      // Only a free choice is remembered: a pinned branch is not a choice, and writing it would make it the
      // remembered branch for the next person on a shared tablet.
      if (!state.pinned && state.multi) writeBranchChoice(next);
      setWanted(next);
    },
    [state],
  );

  const value = useMemo(
    () => ({ ...state, ready, setBranch, pickerOpen, setPickerOpen, workBranchName }),
    [state, ready, setBranch, pickerOpen, workBranchName],
  );
  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

/**
 * The branch context. Outside a provider (a test, a component rendered alone) it answers a one-branch-shaped
 * "nothing to choose" rather than throwing, so a screen never crashes for want of a wrapper.
 */
export function useBranch(): BranchContextValue {
  const value = useContext(BranchContext);
  if (value) return value;
  return {
    branches: [],
    multi: false,
    pinned: false,
    choice: null,
    one: null,
    ready: true,
    setBranch: () => {},
    pickerOpen: false,
    setPickerOpen: () => {},
    workBranchName: null,
  };
}
