import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deltaLabel, deltaTone, periodDeltaPct } from './day-delta';

/** Jira GRW-679 (UX-04) — a comparison is shown only when there is something on both sides of it. */
describe('compared with the period before', () => {
  it('says nothing until this period has something in it — 1:40 am is not "down 100%"', () => {
    expect(periodDeltaPct(0, 169_000)).toBeNull();
  });

  it('says nothing when there is nothing to compare with — never a made-up figure', () => {
    expect(periodDeltaPct(70_000, 0)).toBeNull();
    expect(periodDeltaPct(0, 0)).toBeNull();
  });

  it('works out the change once both sides have something', () => {
    expect(periodDeltaPct(70_000, 169_000)).toBe(-59);
    expect(periodDeltaPct(3, 5)).toBe(-40);
    expect(periodDeltaPct(150, 100)).toBe(50);
    expect(periodDeltaPct(100, 100)).toBe(0);
  });

  it('boundary: the first rupee of the day is enough to compare', () => {
    expect(periodDeltaPct(1, 100)).toBe(-99);
  });

  it('writes the direction once: the arrow, not a sign as well', () => {
    expect(deltaLabel(-59)).toBe('↓ 59%');
    expect(deltaLabel(12)).toBe('↑ 12%');
    expect(deltaLabel(0)).toBe('0%');
  });
});

describe('the Home cards use it, and invent nothing', () => {
  const shop = readFileSync('app/(tenant)/components/home/ShopHome.tsx', 'utf8');
  const owner = readFileSync('app/(tenant)/components/home/OwnerHome.tsx', 'utf8');

  it('the shop Home has no figure that was not worked out', () => {
    expect(shop).not.toMatch(/\? 12 : null/);
    expect(shop).not.toMatch(/\? 4 : null/);
    expect(shop).not.toContain('customersDeltaPct');
    expect(shop).not.toMatch(/\?\? 86\b/);
    expect(shop).toContain('periodDeltaPct(');
  });

  it('the salon Home hides its badge until something has come in', () => {
    expect(owner).toContain('periodDeltaShown');
  });
});

/** Review 2026-11-05 — a day level with yesterday read "0%" in the green of a rise. */
describe('the colour of the change', () => {
  it('is up for a rise, down for a fall, and neither for no change', () => {
    expect(deltaTone(12)).toBe('is-up');
    expect(deltaTone(-59)).toBe('is-down');
    expect(deltaTone(0)).toBe('');
  });

  it('agrees with the arrow the label draws', () => {
    for (const pct of [-100, -1, 0, 1, 250]) {
      const label = deltaLabel(pct);
      expect(label.startsWith('↑'), String(pct)).toBe(deltaTone(pct) === 'is-up');
      expect(label.startsWith('↓'), String(pct)).toBe(deltaTone(pct) === 'is-down');
    }
  });
});
