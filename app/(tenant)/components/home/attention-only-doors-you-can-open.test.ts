import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-11-14, F10 — a retail staff member whose role opens only Attendance was shown Needs attention ("Out of
 * stock 1 · Running low 12 · Returns today 6"), and on a laptop four product rows that opened /stock and sent him back
 * Home. Needs attention is a list of doors: a row that does not open is not drawn, and a person who can open none of
 * them gets no card.
 */
const home = readFileSync(new URL('./ShopHome.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles/83-role-home.css', import.meta.url), 'utf8');

describe('Needs attention shows only what this person can open', () => {
  it('drops a row with no door, on both widths', () => {
    expect(home.match(/\]\.filter\(\(c\) => c\.n > 0 && c\.href !== null\);/g)).toHaveLength(2);
  });

  it('draws no card for somebody who opens neither the shelf nor the orders', () => {
    expect(home).toContain("const attentionReachable = can('/stock') || can('/orders');");
    expect(home.match(/\{attentionReachable \? \(/g)).toHaveLength(2);
    // The laptop's product rows open the shelf, so they need the shelf.
    expect(home).toContain("{areas.stock && can('/stock') && data.running.counted && data.running.items.length > 0 ? (");
  });

  it('lets the trend take the row on a laptop when the card is gone', () => {
    // The row counts what it draws (final check 2026-11-14): the trend, the channel split, Needs attention.
    expect(home).toContain('const midCount = (money ? 1 : 0) + (showChannels ? 1 : 0) + (attentionReachable ? 1 : 0);');
    expect(home).toContain("midCount === 3 ? '' : midCount === 2 ? ' hm-v3-mid-two' : ' hm-v3-mid-one'");
    expect(css).toMatch(/\.hm-v3-mid\.hm-v3-mid-one \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  });
});
