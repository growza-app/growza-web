import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { orderNumber } from './order-number';

/** QA 10 Nov 2026 — one number per order on every screen: the token the guest holds, else the code. */
const src = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('the number an order goes by', () => {
  it('is its token when it has one', () => {
    expect(orderNumber({ code: '2c26f314', tokenNo: 8 })).toBe('#08');
    expect(orderNumber({ code: '2c26f314', tokenNo: 112 })).toBe('#112');
  });

  it('is its code when it has none (a marketplace order, an older one, an older API)', () => {
    expect(orderNumber({ code: '2c26f314', tokenNo: null })).toBe('#2C26F314');
    expect(orderNumber({ code: 'bac30e9d' })).toBe('#BAC30E9D');
  });

  it('Home, the desktop table and the order page all use it — no screen prints the code where a token exists', () => {
    const home = src('../components/home/ShopHome.tsx');
    expect(home).not.toContain('#{o.code.toUpperCase()}');
    expect(home.match(/\{orderNumber\(o\)\}/g)).toHaveLength(3);
    // Jira GRW-716 — an order taken offline goes by its till's token first ("A12").
    // Owner, 2026-11-21 — the table's token sits beside the name; the code only for an order without one.
    const orders = src('../orders/OrdersClient.tsx');
    expect(orders).toContain('const tokenOf = (r: OrderListRow) => r.offlineToken ?? (r.tokenNo ? formatTokenNo(r.tokenNo) : null);');
    expect(orders).toContain("{tokenOf(r) ? null : <span className=\"ord-code\">{t('list.orderCode', { code: r.code.toUpperCase() })}</span>}");
    const page = src('../orders/[id]/OrderClient.tsx');
    // Owner's review 2026-11-13 — a counted shelf titles by "Token n"; the restaurant keeps "Order #n" (QA 10 Nov).
    expect(page).toContain(": t('list.orderCode', { code: order.tokenNo ? formatTokenNo(order.tokenNo).slice(1) : code })");
    expect(page).toContain("order.tokenNo && counted");
    expect(page).toContain("{order.tokenNo || order.offlineToken ? ` · ${t('list.orderCode', { code })}` : ''}");
  });
});
