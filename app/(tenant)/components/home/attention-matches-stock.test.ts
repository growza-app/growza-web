import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QA 13 Nov 2026, bug 1 — a shop's Needs attention said "Out of stock 5 · Running low 18" over a Stock screen that
 * listed 1 and 9 (it counted sizes, the screen counts products), and both rows opened the shelf on "All". From All
 * branches they opened one branch with the whole shop's number. The counts are now the API's `running.shelf` — the
 * Stock screen's own rule, per branch — and each row opens that branch on that filter.
 */
const home = readFileSync(new URL('./ShopHome.tsx', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../../products/ProductsScreen.tsx', import.meta.url), 'utf8');

describe('Needs attention counts what the Stock screen lists', () => {
  it('reads the per-branch shelf counts and links each row to its branch and filter', () => {
    expect(home).toContain('const shelf = data?.running.shelf;');
    expect(home).toContain('`/stock?branch=${encodeURIComponent(locationId)}&filter=${filter}`');
    expect(home).toContain("n: b.out, label: named(s.outOfStockChip, b.branch), href: stockHref(b.locationId, 'out')");
    expect(home).toContain("n: b.low, label: named(s.runningLowChip, b.branch), href: stockHref(b.locationId, 'low')");
    // The Stock screen opens on the filter it is given.
    expect(screen).toContain("params.filter === 'low' || params.filter === 'out'");
  });

  it('feeds both the laptop chips and the phone rows, and a kitchen gets neither', () => {
    expect(home).toContain("...shelfRows('rose', 'amber'),");
    expect(home).toContain("...shelfRows('is-out', ''),");
    expect(home).toContain('if (!counted) return [];');
    expect(home).toContain('const counted = areas.stock && !!data?.running.counted;');
  });

  it('names the branch only when the API does — the All-branches read of a shop with more than one', () => {
    expect(home).toContain('const named = (label: string, branchName?: string) => (branchName ? `${label} · ${branchName}` : label);');
  });
});
