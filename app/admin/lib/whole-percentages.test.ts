import { describe, expect, it } from 'vitest';
import { shareLabel, wholePercentages } from '../components/DashboardParts';

/**
 * Jira GRW-276 — the dashboard's status breakdown claimed 101%.
 *
 * 29 provisioning and 11 active out of 40 is 72.5% and 27.5%; rounding each
 * on its own rounds both UP, and the column then adds to 101. The largest-
 * remainder split these tests pin is what makes the shares total the whole.
 */
describe('wholePercentages', () => {
  it('totals exactly 100 for the split that produced the bug', () => {
    const pct = wholePercentages([29, 11, 0, 0]);
    expect(pct.reduce((a, b) => a + b, 0)).toBe(100);
    // Each share stays within a point of its true value (72.5 / 27.5).
    expect(pct[0]).toBeGreaterThanOrEqual(72);
    expect(pct[0]).toBeLessThanOrEqual(73);
    expect(pct[1]).toBeGreaterThanOrEqual(27);
    expect(pct[1]).toBeLessThanOrEqual(28);
  });

  it('never hands a rounding point to a count of zero', () => {
    // A "0" row reading "1%" would be its own small untruth.
    const pct = wholePercentages([1, 1, 1, 0]);
    expect(pct[3]).toBe(0);
    expect(pct.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('totals 100 for thirds, which no independent rounding can do', () => {
    const pct = wholePercentages([1, 1, 1]);
    expect(pct.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('is all zeroes when there is nothing to divide, rather than dividing by zero', () => {
    expect(wholePercentages([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
  });

  it('gives a single non-zero bucket the whole 100', () => {
    expect(wholePercentages([7, 0, 0, 0])).toEqual([100, 0, 0, 0]);
  });
});

/**
 * Jira GRW-287 (QA of GRW-280, D2) — "Upcoming 24 (0%)" out of 10,011.
 *
 * The rounding is right and stays; what was wrong is printing a share that
 * contradicts the count beside it.
 */
describe('shareLabel', () => {
  it('writes a non-zero share that rounds to 0 as "<1%" — the exact QA split', () => {
    const counts = [24, 9_200, 80, 707];
    const total = counts.reduce((a, b) => a + b, 0);
    const pct = wholePercentages(counts);
    expect(pct[0]).toBe(0);
    expect(shareLabel(counts[0]!, total, pct[0]!)).toBe('<1%');
  });

  it('keeps a real zero as "0%"', () => {
    expect(shareLabel(0, 40, 0)).toBe('0%');
  });

  it('never writes "100%" beside another non-zero share', () => {
    const counts = [9_990, 3];
    const pct = wholePercentages(counts);
    expect(pct[0]).toBe(100);
    expect(shareLabel(counts[0]!, 9_993, pct[0]!)).toBe('>99%');
    expect(shareLabel(counts[1]!, 9_993, pct[1]!)).toBe('<1%');
  });

  it('writes a genuine whole as "100%" and an ordinary share as itself', () => {
    expect(shareLabel(7, 7, 100)).toBe('100%');
    expect(shareLabel(29, 40, 73)).toBe('73%');
  });
});
