import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-19 — "on mobile I tried Sell product, why does Services come?"
 *
 * The phone till drew a Services search row whenever the shelf had a product on it, and Sell product has a shelf by
 * definition. The row opened the same product sheet again. It belongs to the service till only.
 */
describe('Sell product on a phone has no Services row', () => {
  const src = readFileSync(resolve(__dirname, '../../appointments/new/PayFlow.tsx'), 'utf8');

  it('draws the Services row only when the screen is not products-only', () => {
    expect(src).toContain('{!productsOnly && services && (services.length > TILES || products.length > 0 || offers.length > 0) ? (');
  });

  it('still draws the Products row for products-only', () => {
    expect(src).toContain('{productsOnly && products.length > 0 ? (');
  });
});
