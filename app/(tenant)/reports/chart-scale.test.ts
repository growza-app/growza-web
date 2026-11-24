import { describe, expect, it } from 'vitest';
import { axisAmount, scale } from './RestaurantReports';

const money = (m: number | null) => `₹${((m ?? 0) / 100).toLocaleString('en-IN')}`;

describe('the chart scale (owner, 2026-11-24: "graph X and Y")', () => {
  it('rounds the best day up to a round step, four lines', () => {
    expect(scale(3_508_500)).toEqual({ top: 4_000_000, step: 1_000_000 }); // ₹35,085 → ₹40k in ₹10k lines
    expect(scale(1_520_000)).toEqual({ top: 2_000_000, step: 500_000 }); // ₹15,200 → ₹20k in ₹5k lines
    expect(scale(80_000)).toEqual({ top: 80_000, step: 20_000 }); // exactly ₹800 stays ₹800
  });

  it('no sales: no scale', () => {
    expect(scale(0)).toEqual({ top: 0, step: 0 });
  });

  it('names a line short: thousands as k, lakhs as L, small amounts in full', () => {
    expect(axisAmount(4_000_000, money)).toBe('₹40k');
    expect(axisAmount(250_000, money)).toBe('₹2.5k');
    expect(axisAmount(15_000_000, money)).toBe('₹1.5L');
    expect(axisAmount(50_000, money)).toBe('₹500');
    expect(axisAmount(0, money)).toBe('₹0');
  });
});
