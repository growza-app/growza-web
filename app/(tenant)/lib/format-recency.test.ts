import { describe, expect, it } from 'vitest';
import { formatRecency } from './format';

/**
 * Sports-shop QA, 13 Nov 2026 — "Came today" on a buyer who came last night. The days were 24-hour blocks: 8:59 pm to
 * 10 am is thirteen hours, under one block, so "today". They are calendar days in the business's zone now.
 */
describe('how long ago, in calendar days', () => {
  // 10:00 am IST on 13 Nov.
  const NOW = new Date('2026-11-13T04:30:00Z');

  it('last night is yesterday, however few hours ago', () => {
    // 8:59 pm IST on 12 Nov.
    expect(formatRecency('2026-11-12T15:29:00Z', NOW)).toBe('Yesterday');
    expect(formatRecency('2026-11-12T15:29:00Z', NOW, 'hi')).toBe('कल');
  });

  it('earlier this morning is today', () => {
    expect(formatRecency('2026-11-13T03:00:00Z', NOW)).toBe('Today');
  });

  it('counts the shop’s midnight, not UTC’s', () => {
    // 1:00 am IST on 13 Nov is 7:30 pm UTC on the 12th — still today at the shop.
    expect(formatRecency('2026-11-12T19:30:00Z', NOW)).toBe('Today');
  });

  it('two calendar days back is two days ago, even under 48 hours', () => {
    // 11 pm IST on 11 Nov — 35 hours before NOW.
    expect(formatRecency('2026-11-11T17:30:00Z', NOW)).toBe('2 days ago');
  });

  it('never is never', () => {
    expect(formatRecency(null, NOW)).toBe('Never');
  });
});
