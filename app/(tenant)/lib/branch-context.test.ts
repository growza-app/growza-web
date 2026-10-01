import { describe, expect, it } from 'vitest';
import { nextChoice, resolveBranchState, type BranchRef } from './branch-context';

/** Jira GRW-376 · GRW-377 — the rules every screen now shares for "which branch am I looking at?". */
const MEN: BranchRef = { id: 'b-men', name: 'Men' };
const LADIES: BranchRef = { id: 'b-ladies', name: 'Ladies' };
const TWO = [MEN, LADIES];

const state = (over: Partial<Parameters<typeof resolveBranchState>[0]> = {}) =>
  resolveBranchState({ branches: TWO, role: 'owner', memberLocationId: null, wanted: null, ...over });

describe('an owner at a two-branch business', () => {
  it('starts on "all branches", with the main branch as the one a single-branch screen uses', () => {
    expect(state()).toMatchObject({ multi: true, pinned: false, choice: null, one: 'b-men' });
  });

  it('opens on the branch they asked for', () => {
    expect(state({ wanted: 'b-ladies' })).toMatchObject({ choice: 'b-ladies', one: 'b-ladies' });
  });

  it('a branch that has since closed reads as all branches, never as an empty screen (AC-03)', () => {
    expect(state({ wanted: 'b-closed' })).toMatchObject({ choice: null, one: 'b-men' });
  });

  it('can switch, and can switch back to all', () => {
    const s = state();
    expect(nextChoice(s, 'b-ladies')).toBe('b-ladies');
    expect(nextChoice(s, null)).toBeNull();
    expect(nextChoice(s, 'b-somebody-else')).toBeNull();
  });
});

describe('a receptionist (AC-02)', () => {
  it('is pinned to their own branch whatever was remembered', () => {
    expect(state({ role: 'receptionist', memberLocationId: 'b-ladies', wanted: 'b-men' })).toMatchObject({
      pinned: true,
      choice: 'b-ladies',
      one: 'b-ladies',
    });
  });

  it('cannot move', () => {
    const s = state({ role: 'receptionist', memberLocationId: 'b-ladies' });
    expect(nextChoice(s, 'b-men')).toBe('b-ladies');
    expect(nextChoice(s, null)).toBe('b-ladies');
  });

  it('with no branch of their own works at every branch, so is not pinned (GRW-237)', () => {
    expect(state({ role: 'receptionist', memberLocationId: null })).toMatchObject({ pinned: false, choice: null });
  });

  it('whose branch was closed is not pinned to a branch that no longer exists', () => {
    expect(state({ role: 'receptionist', memberLocationId: 'b-closed' })).toMatchObject({ pinned: false });
  });
});

describe('a stylist', () => {
  it('is pinned to their provider branch', () => {
    expect(state({ role: 'staff', memberLocationId: 'b-men' })).toMatchObject({ pinned: true, choice: 'b-men' });
  });
});

describe('a manager', () => {
  it('chooses freely, like an owner', () => {
    expect(state({ role: 'manager', memberLocationId: 'b-men', wanted: 'b-ladies' })).toMatchObject({
      pinned: false,
      choice: 'b-ladies',
    });
  });
});

describe('a one-branch business (FR-05)', () => {
  it('always answers the only branch, and there is nothing to choose', () => {
    const s = resolveBranchState({ branches: [MEN], role: 'owner', memberLocationId: null, wanted: null });
    expect(s).toMatchObject({ multi: false, choice: 'b-men', one: 'b-men' });
    expect(nextChoice(s, null)).toBe('b-men');
  });
});

describe('a business with no open branch', () => {
  it('answers nothing rather than inventing one', () => {
    expect(resolveBranchState({ branches: [], role: 'owner', memberLocationId: null, wanted: 'b-men' })).toMatchObject({
      multi: false,
      choice: null,
      one: null,
    });
  });
});
