import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

/**
 * Jira GRW-462 — and the claim that follows from those hours, not just the hours.
 *
 * GRW-450 (above) stopped Home printing a closing time over several branches, because the business-level
 * `working_hours` row is a fact about none of them. It left `afterClose` reading that same row, so past the
 * business-level hour on All branches the header said "{Business} is closed for today" — and, worse,
 * `listIsTomorrow = afterClose` put TOMORROW's bookings on screen while a branch might still be working
 * today. The wrong day's data, not a sentence to discount.
 *
 * `OwnerHome` is a client component with no DOM here, so the rule is read from source — the same reason
 * `right-now-card.test.ts` reads it for `listIsTomorrow`.
 */
describe('GRW-462 — on All branches, nothing is closed', () => {
  const owner = readFileSync(resolve(__dirname, '../components/home/OwnerHome.tsx'), 'utf8');

  it('does not take the business-level answer as every branch’s', () => {
    expect(owner).toMatch(/const afterClose = !onAllBranches && \(hours\?\.afterClose \?\? false\)/);
  });

  it('is decided before it is used, from the same value the closing time uses', () => {
    const declared = owner.indexOf('const onAllBranches = multiBranch && branch === null');
    expect(declared, 'onAllBranches must exist').toBeGreaterThan(-1);
    expect(declared).toBeLessThan(owner.indexOf('const afterClose ='));
    expect(owner).toMatch(/closingTime\(hours\?\.closesAt, onAllBranches\)/);
    // One declaration, not two that could drift apart.
    expect(owner.match(/const onAllBranches =/g)).toHaveLength(1);
  });

  it('so the list stays on today', () => {
    // `listIsTomorrow` is unchanged and still follows `afterClose` — it is the input that was wrong.
    expect(owner).toMatch(/const listIsTomorrow = afterClose/);
  });

  it('leaves a picked branch, and a one-branch business, saying what they always said', () => {
    // `onAllBranches` is false in both cases — multiBranch is false for one branch, and `branch` is set when
    // one is picked — so the business-level guard cannot reach them.
    expect(owner).toMatch(/const onAllBranches = multiBranch && branch === null/);
  });
});
