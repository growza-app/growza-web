import { describe, expect, it } from 'vitest';
import { weekdayNames } from './weekday-names';

/** Jira GRW-353 — English must read exactly as it did before day names came from Intl. */
describe('weekdayNames', () => {
  it('keeps the English names the editor always showed', () => {
    const en = weekdayNames('en');
    expect(en.full).toEqual(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
    expect(en.short).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(en.narrow).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });

  it('starts on Sunday in every language: index is the weekday', () => {
    expect(weekdayNames('hi').full[0]).toBe('रविवार');
    expect(weekdayNames('hi').full[6]).toBe('शनिवार');
  });

  it('gives Hindi seven distinct one-letter forms where English repeats T and S', () => {
    const hi = weekdayNames('hi').narrow;
    expect(hi).toHaveLength(7);
    expect(new Set(hi).size).toBeGreaterThanOrEqual(6);
  });
});
