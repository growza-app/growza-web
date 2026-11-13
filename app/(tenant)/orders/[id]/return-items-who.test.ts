import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUTE_PAGES } from '@growza-app/shared';

/**
 * QA 13 Nov 2026, bug 6 — a manager was shown "Return items" and refused on Save. The owner decided a manager takes returns
 * (the role that changes Reports, which the desk cannot). The server says who may, as it does for a size swap.
 */
const order = readFileSync(new URL('./OrderClient.tsx', import.meta.url), 'utf8');

describe('Return items is drawn for exactly the people the API accepts', () => {
  it('the route is the Reports manage level, no longer the owner’s alone', () => {
    expect(ROUTE_PAGES['POST /api/v1/sales/:visitKey/returns']).toEqual({ page: 'reports', level: 'manage' });
    // A refund and a swap stay the owner's.
    expect(ROUTE_PAGES['POST /api/v1/orders/:id/refunds']).toBe('owner');
    expect(ROUTE_PAGES['POST /api/v1/orders/:id/exchange']).toBe('owner');
  });

  it('follows the server’s canReturn, and an older API keeps it the owner’s', () => {
    expect(order).toContain('const canReturn = writable && (order.canReturn ?? isOwner);');
    expect(order).toContain('{returnable && canReturn ? (');
  });
});
