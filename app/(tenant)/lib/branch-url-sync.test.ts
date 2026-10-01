import { describe, expect, it } from 'vitest';
import { ALL_BRANCHES_PARAM, urlSyncAction } from './branch-url-sync';

/** Jira GRW-376 · GRW-377 — Reports and Availability agree with the branch chosen on any other screen. */
describe('an address meeting the shared branch choice', () => {
  it('arriving with no branch in the address takes the one chosen elsewhere (AC-01)', () => {
    expect(urlSyncAction(null, 'b-men')).toEqual({ kind: 'redirect', branch: 'b-men' });
  });

  it('a branch named in the address becomes the choice everywhere (FR-03)', () => {
    expect(urlSyncAction('b-ladies', 'b-men')).toEqual({ kind: 'remember', branch: 'b-ladies' });
  });

  it('"all" in the address is a choice too, and is never redirected back to a branch', () => {
    expect(urlSyncAction(ALL_BRANCHES_PARAM, 'b-men')).toEqual({ kind: 'remember', branch: null });
  });

  it('nothing named and nothing chosen does nothing', () => {
    expect(urlSyncAction(null, null)).toEqual({ kind: 'none' });
  });
});
