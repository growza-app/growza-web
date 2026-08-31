import { describe, expect, it } from 'vitest';

import { FLAT_THRESHOLD_PCT, linearTrend } from './trend';

/**
 * The Bookings card is headed "Is work going up or down?", so the direction
 * it prints has to be right for the shapes real booking data takes — noisy,
 * short, and occasionally starting from nothing.
 */
describe('linearTrend', () => {
  it('calls a rising series up', () => {
    const t = linearTrend([4, 6, 8, 10, 12])!;
    expect(t.direction).toBe('up');
    expect(t.from).toBeCloseTo(4, 5);
    expect(t.to).toBeCloseTo(12, 5);
    expect(t.changePct).toBe(200);
  });

  it('calls a falling series down', () => {
    expect(linearTrend([20, 16, 12, 8, 4])!.direction).toBe('down');
  });

  it('is far less swayed by one closed day than comparing the ends would be', () => {
    // A month of steady growth with one public holiday sitting on the last
    // day. Reading the first and last points would call this a 90% collapse;
    // the fit still reports the rise that is actually there.
    const month = Array.from({ length: 30 }, (_, i) => 10 + i);
    const withHoliday = [...month.slice(0, 29), 2];

    expect(withHoliday[0]! > withHoliday[29]!).toBe(true); // ends say "down"
    expect(linearTrend(withHoliday)!.direction).toBe('up'); // the fit does not
  });

  it('lets a genuinely bad end flatten a short stretch rather than insisting on the rise', () => {
    // Seven points, the last one 90% below the one before it. There is not
    // enough series left for the rise to outweigh it, and saying "picking up"
    // to an owner whose week just fell off a cliff would be wrong.
    expect(linearTrend([10, 12, 14, 16, 18, 20, 2])!.direction).toBe('flat');
  });

  it('calls a wobbling but level series flat', () => {
    const t = linearTrend([12, 8, 13, 9, 12, 10])!;
    expect(t.direction).toBe('flat');
    expect(Math.abs(t.changePct!)).toBeLessThan(FLAT_THRESHOLD_PCT);
  });

  it('returns null below three points, where there is nothing to average out', () => {
    expect(linearTrend([])).toBeNull();
    expect(linearTrend([5])).toBeNull();
    expect(linearTrend([5, 9])).toBeNull();
  });

  it('reports a direction without a percentage when the stretch started at zero', () => {
    // Dividing by a zero start would be an infinite rise; the card says the
    // direction instead of printing one.
    const t = linearTrend([0, 0, 6, 12])!;
    expect(t.changePct).toBeNull();
    expect(t.direction).toBe('up');
  });

  it('never fits a negative number of bookings', () => {
    // A steep fall extrapolates below zero, which is not a thing that can be
    // said about bookings.
    const t = linearTrend([30, 12, 4, 1])!;
    expect(t.to).toBeGreaterThanOrEqual(0);
  });

  it('calls a perfectly flat series flat rather than dividing by nothing', () => {
    const t = linearTrend([7, 7, 7, 7])!;
    expect(t.direction).toBe('flat');
    expect(t.changePct).toBe(0);
  });
});
