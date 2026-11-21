import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changesOrders, ORDERS_STALE_MS } from './orders-changed';

const api = readFileSync(resolve(__dirname, 'api.ts'), 'utf8');
const home = readFileSync(resolve(__dirname, '../components/home/ShopHome.tsx'), 'utf8');

/** Owner, 2026-11-21 — an open Home learns of a paid order without polling the database. */
describe('an order changed here tells an open Home; nothing polls', () => {
  it('the writes that change an order are recognised, and nothing else', () => {
    for (const p of ['/api/v1/counter-sales', '/api/v1/orders/abc/status', '/api/v1/orders/abc/client', '/api/v1/tables/t1/seat']) expect(changesOrders(p), p).toBe(true);
    for (const p of ['/api/v1/products', '/api/v1/stock/wastage', '/api/v1/orders', '/api/v1/settings/table-orders/b1']) expect(changesOrders(p), p).toBe(false);
  });

  it('every successful write through the API client announces it', () => {
    expect(api).toContain('if (changesOrders(path)) announceOrdersChanged();');
  });

  it('Home re-reads its orders on the announcement or when looked at after a minute — never on a timer', () => {
    expect(ORDERS_STALE_MS).toBe(60_000);
    expect(home).toContain("window.addEventListener(ORDERS_CHANGED_EVENT, reread);");
    expect(home).toContain('if (e.key === ORDERS_CHANGED_KEY) reread();');
    expect(home).toContain("document.visibilityState === 'visible' && Date.now() - ordersReadAt.current > ORDERS_STALE_MS");
    expect(home).not.toMatch(/setInterval\(/);
  });
});
