import { describe, expect, it } from 'vitest';
import { amount, parseAmount, recipeAmount } from './kitchen-units';

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
