import { describe, expect, it } from 'vitest';
import { formatDate, formatDateShort, formatDateWithWeekday } from './format';

/** Jira GRW-364 — dates follow the language; English is exactly what it was. */
const day = new Date('2026-08-26T12:00:00Z');

describe('date formats by language', () => {
  it('keep the English spec', () => {
    expect(formatDate(day, 'UTC')).toBe('26 Aug 2026');
    expect(formatDate(day, 'UTC', 'en')).toBe('26 Aug 2026');
    // Node's en-IN keeps a second comma before the year; that was already so before this change.
    expect(formatDateWithWeekday(day, 'UTC')).toMatch(/^Wed 26 Aug,? 2026$/);
    expect(formatDateWithWeekday(day, 'UTC', { withYear: false })).toMatch(/^Wed 26 Aug$/);
    expect(formatDateShort(day, 'UTC')).toBe('26 Aug');
  });

  it('use the language’s own month and weekday names in Hindi', () => {
    const hi = formatDateWithWeekday(day, 'UTC', { locale: 'hi' });
    expect(hi).toMatch(/[ऀ-ॿ]/);
    expect(hi).toContain('2026');
    expect(hi).not.toMatch(/Wed|Aug/);
    expect(formatDate(day, 'UTC', 'hi')).not.toMatch(/Aug/);
    expect(formatDateShort(day, 'UTC', 'hi')).toMatch(/[ऀ-ॿ]/);
  });
});
