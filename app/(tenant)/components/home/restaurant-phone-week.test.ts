import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shortRupees } from './parts';

const code = (p: string) =>
  readFileSync(resolve(__dirname, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

/** Owner, 2026-11-26 — "move queue card below and add this on mobile": the week's bars on a restaurant's phone Home. */
describe("a restaurant's phone Home draws the week's bars above the Queue card", () => {
  const home = code('ShopHome.tsx');
  const stack = home.slice(home.indexOf('className="shp-mobile-stack"'));

  it('puts the bars before the Queue card, for a kitchen with money in the week', () => {
    const bars = stack.indexOf('bars={phoneWeekBars}');
    expect(bars).toBeGreaterThan(-1);
    expect(bars).toBeLessThan(stack.indexOf('className="shp-col-stack"'));
    expect(stack).toContain('isKitchen && money && trendChart.totalMinor > 0 ?');
  });

  it("reads the last seven days on the phone itself, after the hero's money gates", () => {
    const feed = home.slice(home.indexOf('if (!canPhoneRange) return;'), home.indexOf('[phone, phonePeriod, branch, canPhoneRange'));
    expect(feed).toContain("api\n        .byChannel({ range: 'last_7_days', location: branch ?? undefined })");
    expect(feed).toContain('if (mine === phoneReqId.current) setChannelData(res);');
  });

  it("styles the bars at every width, and draws the phone's card like the cards round it", () => {
    const css = code('../../styles/99-z-emerald-v2.css');
    const firstDesk = css.indexOf('@media (min-width: 861px) {');
    expect(css.indexOf('.rst-week-bars {')).toBeLessThan(firstDesk);
    expect(css).toContain(':is(.shp-mobile-stack, .shp-week) .rst-week-panel {'); // a shop's phone draws the same card under Quick links (owner, 2026-11-28)
  });
});

describe('a short amount for a phone bar', () => {
  it.each([
    [0, '₹0'],
    [24000, '₹240'],
    [99900, '₹999'],
    [100000, '₹1k'],
    [260000, '₹2.6k'],
    [999949, '₹10k'],
    [2075000, '₹21k'],
    [10520500, '₹105k'],
  ])('%i paise reads %s', (minor, text) => {
    expect(shortRupees(minor)).toBe(text);
  });
});
