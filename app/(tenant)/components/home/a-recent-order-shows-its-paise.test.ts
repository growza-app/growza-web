import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exactRupees, rupees } from './parts';

/**
 * QA 2026-11-06 — a Recent orders row read ₹749 for an order that is ₹748.50 on Orders and the POS. A row that stands for
 * one bill keeps its paise; every total and card on Home stays whole rupees (QA 2026-10-23).
 */
describe('exactRupees', () => {
  it('keeps the paise of one order, and only when there are some', () => {
    expect(exactRupees(74_850)).toBe('₹748.50');
    expect(exactRupees(46_600)).toBe('₹466');
  });
  it('leaves the whole-rupee rule for totals alone', () => {
    expect(rupees(74_850)).toBe('₹749');
  });
});

describe('where Home uses which', () => {
  const home = readFileSync(path.resolve(import.meta.dirname, 'ShopHome.tsx'), 'utf8');
  it('the Recent orders row uses the exact amount, the takings use whole rupees', () => {
    expect(home).toContain('{exactRupees(o.amountMinor)}');
    expect(home).toContain('{rupees(data.today.takingsMinor)}');
  });
});
