import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canSee } from '../../lib/nav-policy';
import type { Areas } from '../../lib/areas';

/**
 * Jira GRW-709 sweep (2026-11-14) — a shop's Staff role on a laptop: Home's Needs attention showed "running low", linked to
 * /products, and the role cannot open it, so the row sent him Home. A row is drawn only where its screen opens (F10's rule).
 */
const src = readFileSync(new URL('./ShopHome.tsx', import.meta.url), 'utf8');
const SHOP: Areas = { bookings: false, services: false, shop: true, stock: true };

describe('the laptop Needs attention rows', () => {
  it('draw Running low only for someone who opens Stock, and never fall back to Products', () => {
    expect(src).toContain('if (data?.running.counted && data.running.total > 0 && can(\'/stock\')) {');
    expect(src).not.toContain(": '/products',");
  });

  it('draw Waiting for payment only for someone who opens Orders', () => {
    expect(src).toContain("if (waitingForPayment > 0 && can('/orders')) {");
  });

  it('a shop Staff role opens neither, so the card is not drawn for him', () => {
    expect(canSee('/stock', 'staff', undefined, true, SHOP)).toBe(false);
    expect(canSee('/products', 'staff', undefined, true, SHOP)).toBe(false);
    expect(canSee('/stock', 'owner', undefined, true, SHOP)).toBe(true);
  });
});
