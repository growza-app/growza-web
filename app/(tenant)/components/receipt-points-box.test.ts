import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from '../lib/dashboard-root';

/**
 * Owner, 2026-11-24 — a receipt's points box read one word a line ("You / earned / 5 / points / toward / s …") beside
 * "7 points expire on 23 Nov 2027.", and said "next visit" twice. The words take the room and wrap as a sentence; the
 * balance is capped and wraps under its figure; the two lines say different things.
 */
const read = (rel: string) => readFileSync(fromDashboard(rel), 'utf8');
const css = read('app/(tenant)/styles/72-walk-in-sheet.css');
const en = JSON.parse(read('messages/en.json'));
const hi = JSON.parse(read('messages/hi.json'));

describe('the receipt points box', () => {
  it('the words take the free space and may shrink; the balance is capped and wraps', () => {
    expect(css).toMatch(/\.wi-rc-rewards-left \{[^}]*flex: 1 1 auto;\s*min-width: 0;/);
    expect(css).toMatch(/\.wi-rc-rewards-bal \{[^}]*flex: 0 1 auto;\s*max-width: 42%;/);
    expect(css).toMatch(/\.wi-rc-rewards-bal-val \{\s*white-space: nowrap;/);
  });

  it('"next visit" is said once, in English and Hindi, and the second line ends with a full stop', () => {
    const find = (o: Record<string, unknown>, k: string): string[] =>
      Object.entries(o).flatMap(([key, v]) => (key === k && typeof v === 'string' ? [v] : v && typeof v === 'object' ? find(v as Record<string, unknown>, k) : []));
    expect(find(en, 'receiptEarned')).toEqual(['You earned {points, plural, one {# point} other {# points}}.']);
    expect(find(en, 'rcRewardSub')).toEqual(['Use them on your next visit.']);
    expect(find(hi, 'receiptEarned')[0]).not.toContain('अगली');
    expect(find(hi, 'rcRewardSub')[0]).toMatch(/।$/);
  });
});
