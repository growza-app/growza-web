import { describe, expect, it } from 'vitest';
import { durationPhrase, type DurationWords } from './duration-words';

/** Stand-ins for the catalogue's own words, so the arithmetic is what is under test. */
const words: DurationWords = {
  minutes: (count) => `${count} min`,
  hours: (count) => `${count} ${count === 1 ? 'hr' : 'hrs'}`,
  hoursMinutes: (hours, minutes) => `${hours} ${hours === 1 ? 'hr' : 'hrs'} ${minutes} min`,
};

describe('how long something takes', () => {
  it('under an hour is minutes and nothing else', () => {
    expect(durationPhrase(30, words)).toBe('30 min');
    expect(durationPhrase(59, words)).toBe('59 min');
  });

  it('a whole hour says no minutes — "1 hr 0 min" is not something anybody says', () => {
    expect(durationPhrase(60, words)).toBe('1 hr');
    expect(durationPhrase(120, words)).toBe('2 hrs');
  });

  it('an hour and a bit says both', () => {
    expect(durationPhrase(75, words)).toBe('1 hr 15 min');
    expect(durationPhrase(165, words)).toBe('2 hrs 45 min');
  });

  /** The two the QA pass found: a raw minute count, and 165 minutes rendered as "~2.8 hrs". */
  it('the longest a service can be reads as hours, not 730 minutes', () => {
    expect(durationPhrase(730, words)).toBe('12 hrs 10 min');
    expect(durationPhrase(720, words)).toBe('12 hrs');
  });

  it('zero is zero minutes, not "0 hrs"', () => {
    expect(durationPhrase(0, words)).toBe('0 min');
  });

  it('a number that is not one, or is below zero, is zero rather than NaN on the screen', () => {
    expect(durationPhrase(Number.NaN, words)).toBe('0 min');
    expect(durationPhrase(-30, words)).toBe('0 min');
  });

  it('rounds to the minute rather than printing a fraction', () => {
    expect(durationPhrase(90.4, words)).toBe('1 hr 30 min');
  });
});
