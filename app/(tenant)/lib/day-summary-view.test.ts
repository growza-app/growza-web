import { describe, expect, it } from 'vitest';
import { branchTag, closingTime } from './day-summary-view';

/**
 * Jira GRW-450 — the two claims the end-of-day readout makes about a branch, and when it may make them.
 */
const BRANCHES = [
  { id: 'b1', name: 'Indiranagar' },
  { id: 'b2', name: 'Koramangala' },
];

describe('naming the branch a stylist works at', () => {
  it('names it while the list mixes branches', () => {
    expect(branchTag('b2', BRANCHES)).toBe('Koramangala');
  });

  it('says nothing on one branch\'s own summary', () => {
    // There is no `branches` on a branch's summary: every row would repeat the name at the top of the sheet.
    expect(branchTag('b2', undefined)).toBeNull();
  });

  it('says nothing in a one-branch business', () => {
    expect(branchTag('b1', [{ id: 'b1', name: 'Indiranagar' }])).toBeNull();
  });

  it('says nothing for a row that names no branch', () => {
    // The no-stylist row. Its visits can span branches, so the first name in the list would be a guess.
    expect(branchTag(null, BRANCHES)).toBeNull();
    expect(branchTag(undefined, BRANCHES)).toBeNull();
  });

  it('says nothing for a branch the summary does not list', () => {
    // Closed or renamed since the page loaded — an unknown id is left untagged rather than rendered blank.
    expect(branchTag('gone', BRANCHES)).toBeNull();
  });
});

describe('the closing time the screen may claim', () => {
  it('a single branch says its own', () => {
    expect(closingTime('20:00', false)).toBe('20:00');
  });

  it('all branches claim none', () => {
    // Branches close at different times, so the business-level fallback names a time nobody closed at.
    expect(closingTime('20:00', true)).toBeNull();
  });

  it('a branch with no hours set claims none either', () => {
    expect(closingTime(null, false)).toBeNull();
    expect(closingTime(undefined, false)).toBeNull();
  });
});
