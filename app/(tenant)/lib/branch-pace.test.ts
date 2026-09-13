import { describe, expect, it } from 'vitest';
import { branchPace } from './branch-pace';

/** Jira GRW-225 — AC-03's Busy/Slow pill. */
describe('branchPace', () => {
  it('calls the busiest branch busy', () => {
    expect(branchPace(19, [19, 13])).toBe('busy');
  });

  it('keeps a branch busy at 60% of the busiest or more', () => {
    expect(branchPace(13, [19, 13])).toBe('busy');
    expect(branchPace(6, [10, 6])).toBe('busy');
  });

  it('calls a branch slow below 60% of the busiest', () => {
    expect(branchPace(5, [10, 5])).toBe('slow');
    expect(branchPace(0, [4, 0])).toBe('slow');
  });

  it('shows no pill before any branch has a booking', () => {
    expect(branchPace(0, [0, 0])).toBeNull();
    expect(branchPace(0, [])).toBeNull();
  });
});
