import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-11-06 — the restaurant Home on a laptop drew "Recent orders" and "Needs attention" from the design mock: an order
 * number counted down from #1038, "Dine-in · Table 5 · 2 min ago", a kitchen state chosen by position in the list, and two
 * warnings — "2 menu items are running low", "1 order is waiting for more than 15 min" — that were always there. Found by the
 * restaurant UI suite (e2e/restaurant, in the API repo), which reads Home against the bills it rang up.
 */
const home = readFileSync(path.resolve(import.meta.dirname, 'ShopHome.tsx'), 'utf8');
const copy = readFileSync(path.resolve(import.meta.dirname, '../../lib/home-copy.ts'), 'utf8');

describe('Recent orders', () => {
  it('shows each order by its own code, channel, time and state', () => {
    // QA 10 Nov 2026 — by its own number: the stored token where there is one, else its code (lib/order-number).
    expect(home).toContain('{orderNumber(o)}</strong>');
    expect(home).toContain('${channelWord(o.channel)} · ${formatDateTime(o.soldAt)}');
    expect(home).toContain('o.paymentPending ? s.paymentPendingState : stateWord(o.status)');
    expect(home).toContain('isDeliveryApp(o.channel)');
  });

  it('invents nothing: no counted-down number, no table, no kitchen state picked by position', () => {
    expect(home).not.toMatch(/1038/);
    expect(home).not.toContain('tableWord(');
    expect(home).not.toContain('s.dineInMode');
    expect(home).not.toMatch(/isTakeaway/);
    expect(home).not.toMatch(/idx\s*===\s*[12]/);
  });
});

describe('Needs attention', () => {
  it('counts low stock from the shelf, and only once it has been counted', () => {
    expect(home).toMatch(/data\?\.running\.counted && data\.running\.total > 0/);
    expect(home).toContain('s.menuItemsLowSub(data.running.total)');
  });

  it('counts orders waiting for payment from the orders it lists', () => {
    expect(home).toContain('recentOrders.filter((o) => o.paymentPending).length');
    expect(home).toContain('s.pendingPaymentSub(waitingForPayment)');
  });

  it('shows no warning card and no count when there is nothing to warn of', () => {
    expect(home).toContain('attention.length === 0');
    expect(home).toContain('s.nothingNeedsYou');
    expect(home).not.toMatch(/attentionItemsBadge\(\d\)/);
    expect(home).not.toMatch(/menuItemsLowSub\(\d\)/);
    expect(home).not.toMatch(/pendingOrdersWaitSub/);
  });

  it('has its words in English and Hindi', () => {
    for (const key of ['paymentPendingState', 'pendingPaymentSub', 'nothingNeedsYou']) expect(copy).toContain(`${key}:`);
  });
});
