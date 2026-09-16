import { describe, expect, it } from 'vitest';
import { wholePercentages } from '../components/DashboardParts';

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
