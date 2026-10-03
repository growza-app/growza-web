import { describe, expect, it } from 'vitest';
import { formatDuration, relativeCountdown, summarizeServices } from './appointment-display';
import { chartBucketLabel, formatRecency, heatmapHourLabel } from './format';

/**
 * Jira GRW-478 (U-3) — the `.ts` helpers that write words a person reads.
 *
 * The i18n guard (`i18n-guard.test.ts`) reads JSX text in `.tsx` files; these helpers return their words as plain
 * strings, so it never saw them, and on a Hindi screen they stayed English: "1h 30m", "+ 3 more", "5 days ago",
 * "1 Sep", "12p". This is their guard: in Hindi, not one Latin letter.
 */
const LATIN = /[A-Za-z]/;
const NOW = new Date('2026-09-20T06:30:00Z');

describe('display helpers in Hindi', () => {
  const outputs: Array<[string, string]> = [
    ['formatDuration 30', formatDuration(30, 'hi')],
    ['formatDuration 60', formatDuration(60, 'hi')],
    ['formatDuration 90', formatDuration(90, 'hi')],
    ['summarizeServices', summarizeServices(['बाल', 'फ़ेशियल', 'डी-टैन', 'मसाज', 'मेनीक्योर'], 'hi')],
    ['relativeCountdown ahead', relativeCountdown('2026-09-20T07:00:00Z', NOW, 'hi')],
    ['relativeCountdown past', relativeCountdown('2026-09-20T05:00:00Z', NOW, 'hi')],
    ['relativeCountdown now', relativeCountdown('2026-09-20T06:30:00Z', NOW, 'hi')],
    ['formatRecency never', formatRecency(null, NOW, 'hi')],
    ['formatRecency today', formatRecency('2026-09-20T05:00:00Z', NOW, 'hi')],
    ['formatRecency days', formatRecency('2026-09-15T05:00:00Z', NOW, 'hi')],
    ['formatRecency months', formatRecency('2026-05-15T05:00:00Z', NOW, 'hi')],
    ['formatRecency years', formatRecency('2024-05-15T05:00:00Z', NOW, 'hi')],
    ['chartBucketLabel day', chartBucketLabel('2026-09-01T00:00:00.000+05:30', 'day', 'hi', '1 Sep')],
    ['chartBucketLabel month', chartBucketLabel('2026-09-01T00:00:00.000+05:30', 'month', 'hi', 'Sep')],
    ['heatmapHourLabel', heatmapHourLabel(13, '1', 'hi') + heatmapHourLabel(0, '12a', 'hi') + heatmapHourLabel(12, '12p', 'hi')],
  ];
  for (const [name, text] of outputs) {
    it(`${name}: "${text}"`, () => expect(text).not.toMatch(LATIN));
  }
});

describe('English is unchanged', () => {
  it('reads as it did', () => {
    expect(formatDuration(90)).toBe('1h 30m');
    expect(summarizeServices(['a', 'b', 'c', 'd', 'e'])).toBe('a + b + c + 2 more');
    expect(relativeCountdown('2026-09-20T07:00:00Z', NOW)).toBe('in 30 min');
    expect(formatRecency('2026-09-15T05:00:00Z', NOW)).toBe('5 days ago');
    expect(chartBucketLabel('2026-09-01T00:00:00.000+05:30', 'day', 'en', '1 Sep')).toBe('1 Sep');
    expect(heatmapHourLabel(13, '1')).toBe('1');
  });

  it('a year less five days is a year, not "0 years ago"', () => {
    expect(formatRecency('2025-09-24T05:00:00Z', NOW)).toBe('1 year ago');
  });
});
