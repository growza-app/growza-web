import { describe, expect, it } from 'vitest';
import { formatDate, formatDateShort, formatDateWithWeekday, formatMoney } from './format';

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

/** Owner-app audit 2026-10-10 — one rounding rule for money: whole rupees show none, anything else shows paise. */
describe('formatMoney', () => {
  it('shows whole rupees without paise and anything else with two', () => {
    expect(formatMoney('30000')).toBe('₹300');
    expect(formatMoney(49950)).toBe('₹499.50');
    expect(formatMoney('110000')).toBe('₹1,100');
    expect(formatMoney(1)).toBe('₹0.01');
  });

  it('renders nothing as an em dash, as the 78 callers rely on', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney('')).toBe('—');
    expect(formatMoney('not-a-number')).toBe('—');
  });

  it('takes a language or a full locale tag', () => {
    expect(formatMoney(49950, 'INR', 'en-IN')).toBe('₹499.50');
    expect(formatMoney(49950, 'INR', 'hi')).toBe(formatMoney(49950, 'INR', 'hi-IN'));
    expect(formatMoney(49950, 'INR', 'hi')).toContain('499.50');
  });
});
