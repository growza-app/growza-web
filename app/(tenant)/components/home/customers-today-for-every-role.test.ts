import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QA 13 Nov 2026, bug 4 — the desk's Home said "0 · Came in today" where the owner's said 5: the count came from the
 * latest hundred orders, which Home reads only for a role that may open Orders. It is now the API's `customersToday`.
 */
const home = readFileSync(new URL('./ShopHome.tsx', import.meta.url), 'utf8');

describe('Came in today is the same number for every role', () => {
  it('takes the API’s count, and counts the order rows only for an older API', () => {
    expect(home).toContain('const apiCustomersToday = data?.customersToday;');
    expect(home).toContain("if (typeof apiCustomersToday === 'number') return apiCustomersToday;");
    expect(home).toContain('}, [apiCustomersToday, todayOrderRows, fmtDate]);');
  });
});
