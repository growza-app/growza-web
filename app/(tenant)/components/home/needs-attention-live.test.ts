import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QA 13 Nov 2026, bug 2 — the phone's Needs attention read "(51)" on Today and "(50)" on every other period: three of
 * its rows are live counts, but Returns was the period's figure and so was drawn on Today only. It is now the API's
 * live `cameBackToday`, so the card says the same whichever period the hero above it is on.
 */
const home = readFileSync(new URL('./ShopHome.tsx', import.meta.url), 'utf8');
const copy = readFileSync(new URL('../../lib/home-copy.ts', import.meta.url), 'utf8');

describe('the phone Needs attention does not move with the period', () => {
  it('counts returns from the live figure, with the Today-only figure kept for an older API', () => {
    expect(home).toContain("n: data?.cameBackToday ?? (phonePeriod === 'today' ? (phoneChannel?.totals.returnedOrders ?? 0) : 0),");
    expect(home).toContain('label: s.returnsTodayLabel,');
  });

  it('says "today" in both languages, since the row no longer follows the period', () => {
    expect(copy).toContain("returnsTodayLabel: S('Returns today', 'आज की वापसी'),");
  });
});
