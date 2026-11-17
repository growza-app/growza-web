import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-11-17 — "Add items" on a queued order opened the table map at a restaurant with tables, so no dish could
 * be added to that order. The add-items till never shows the map: the order already has its place. Source-reading; the
 * restaurant browser suite (spec 16) drives it for real.
 */
const flow = readFileSync(resolve(__dirname, 'PayFlow.tsx'), 'utf8');

describe('Add items at a restaurant with tables', () => {
  it('goes straight to the dishes, never the table map', () => {
    expect(flow).toContain("if (tablesHere && orderTab === 'dine_in' && !atTable && !addingTo && !token && step === 'what' && location) {");
  });
});
