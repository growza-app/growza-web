import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Prod QA, 2026-10-24 — the till and New booking chose their layout once, at load. Narrowed afterwards (a tablet turned,
 * split view, a smaller window) they kept the wide layout, which has no styles below 1101px.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '..', '..', p), 'utf8');

describe('a screen that picks its layout by width follows the width', () => {
  for (const file of ['products/sell/SellProductClient.tsx', 'appointments/new/NewBookingClient.tsx']) {
    it(file, () => {
      const s = src(file);
      expect(s).toContain("addEventListener('change', update)");
      expect(s).toContain("removeEventListener('change', update)");
      expect(s).not.toMatch(/setWide\(window\.matchMedia\([^)]*\)\.matches\)/);
    });
  }
});
