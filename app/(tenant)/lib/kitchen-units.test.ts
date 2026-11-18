import { describe, expect, it } from 'vitest';
import { amount, businessToday, packQty, parseAmount, parseRupees, recipeAmount, rupeesText } from './kitchen-units';

/** Jira GRW-737 — thousandths in, what a cook reads out; what they type, back to thousandths. */
describe('kitchen amounts', () => {
  it('reads thousandths as a cook writes them', () => {
    expect(amount(9_500)).toBe('9.5');
    expect(amount(250)).toBe('0.25');
    expect(amount(-200)).toBe('-0.2');
    expect(amount(48_000)).toBe('48');
    expect(amount(1)).toBe('0.001');
  });

  it('parses up to three decimals in the item unit, and whole grams', () => {
    expect(parseAmount('0.25', 'kg')).toBe(250);
    expect(parseAmount('10', 'kg')).toBe(10_000);
    expect(parseAmount('1,5', 'l')).toBe(1_500);
    expect(parseAmount('250', 'kg', 'small')).toBe(250);
    expect(parseAmount('0.2505', 'kg')).toBeNull();
    expect(parseAmount('2.5', 'kg', 'small')).toBeNull();
    expect(parseAmount('-1', 'kg')).toBeNull();
    expect(parseAmount('abc', 'kg')).toBeNull();
    expect(parseAmount('0', 'kg')).toBeNull();
    expect(parseAmount('0', 'kg', 'big', true)).toBe(0);
    expect(parseAmount('5', 'pcs', 'small')).toBeNull();
  });

  it('shows a recipe line in grams under a kilo', () => {
    expect(recipeAmount(250, 'kg')).toEqual({ text: '250', unit: 'g' });
    expect(recipeAmount(1_200, 'kg')).toEqual({ text: '1.2', unit: 'kg' });
    expect(recipeAmount(2_000, 'pcs')).toEqual({ text: '2', unit: 'pcs' });
    expect(recipeAmount(50, 'l')).toEqual({ text: '50', unit: 'ml' });
  });
});

describe('Jira GRW-738 — prices, today, packs', () => {
  it('reads rupees into paise; refuses a negative, three decimals or words', () => {
    expect(parseRupees('250')).toBe(25_000);
    expect(parseRupees(' 180.5 ')).toBe(18_050);
    expect(parseRupees('1,250.75')).toBe(125_075);
    expect(parseRupees('0')).toBe(0);
    for (const bad of ['', '-5', '2.555', 'abc', '1e3']) expect(parseRupees(bad), bad).toBeNull();
    expect(rupeesText(18_050)).toBe('180.5');
  });

  it('today is the business’s own date, and a pack line comes to pack × packs', () => {
    // 20:00 UTC on 17 Nov is already 18 Nov in India.
    expect(businessToday('Asia/Kolkata', new Date('2026-11-17T20:00:00Z'))).toBe('2026-11-18');
    expect(packQty(30_000, 2_000)).toBe(60_000);
    expect(packQty(1_000, 2_125)).toBe(2_125);
  });
});
