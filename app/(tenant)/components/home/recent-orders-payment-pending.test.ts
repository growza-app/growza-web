import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const home = readFileSync(resolve(__dirname, 'ShopHome.tsx'), 'utf8');

/** Owner, 2026-11-21 — an order kept in the queue, not yet paid, said "Done" in the phone's Recent orders. */
describe('Home never calls an unpaid order Done', () => {
  it('every Recent orders list words and colours an order through orderWord / orderTone', () => {
    expect(home).toContain("const orderWord = (o: Pick<OrderListRow, 'status' | 'paymentPending'>) => (o.paymentPending ? s.paymentPendingState : stateWord(o.status));");
    expect(home).toContain("const orderTone = (o: Pick<OrderListRow, 'status' | 'paymentPending'>) => (o.paymentPending ? 'amber' : stateTone(o.status));");
    // No list reads an order's status word straight from its status (that skips "payment pending").
    expect(home).not.toMatch(/stateWord\(o\.status\)\}?<|>\{stateWord\(o\.status\)\}/);
    expect(home.match(/orderWord\(o\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
