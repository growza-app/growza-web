import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homeCopy } from '../../lib/home-copy';

/**
 * Owner, 2026-11-17 — "tables would be better": at a restaurant with Table orders on, the owner's and a manager's Home
 * Quick links offer Tables where the Queue was; the counter keeps its list, named Pickup as on the till.
 */
const home = readFileSync(resolve(__dirname, 'ShopHome.tsx'), 'utf8');

describe('Home Quick links at a restaurant with tables', () => {
  it('owner and manager: Tables, opening the till on the room', () => {
    expect(home).toContain("tablesOn && canReports\n            ? { href: '/pos', label: s.tablesTitle, icon: <IconTable />, tone: 'blue' }");
  });
  it('the counter: Pickup with tables on, Queue with them off', () => {
    expect(home).toContain("{ href: '/pos?mode=queue', label: tablesOn ? s.pickupTitle : s.queueTitle, icon: <IconNavOrders />, tone: 'blue' }");
  });
  it('tables on means the picked branch, or any branch on All branches', () => {
    expect(home).toContain('(session?.branches ?? []).some((b) => b.tableOrders && (branch === null || b.id === branch))');
  });
  it('is said in English and Hindi', () => {
    const en = homeCopy('en', {} as never).shop;
    const hi = homeCopy('hi', {} as never).shop;
    expect([en.tablesTitle, en.pickupTitle]).toEqual(['Tables', 'Pickup']);
    expect([hi.tablesTitle, hi.pickupTitle]).toEqual(['टेबल', 'पिकअप']);
  });
});
