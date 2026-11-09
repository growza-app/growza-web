import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { paidCustomers } from './paid-customers';

describe("Home's Customers counts only people who have paid (owner, 9 Nov 2026)", () => {
  it('is everyone on the book less those who never paid a bill or finished a visit', () => {
    // 11 on the book; Lalitha's only order was cancelled, so she has never been in.
    expect(paidCustomers({ total: 11, neverVisited: 1 })).toBe(10);
    expect(paidCustomers({ total: 0, neverVisited: 0 })).toBe(0);
  });

  it('shows nothing until the figures have loaded, never a made-up number', () => {
    expect(paidCustomers(null)).toBeNull();
    expect(paidCustomers(undefined)).toBeNull();
  });

  it('is what both Homes draw', () => {
    const shop = readFileSync(resolve(__dirname, '../components/home/ShopHome.tsx'), 'utf8');
    const owner = readFileSync(resolve(__dirname, '../components/home/OwnerHome.tsx'), 'utf8');
    expect(shop).toContain('const customersTotal = paidCustomers(customerStats);');
    expect(owner).toContain('const totalClientsCount = paidCustomers(clientStats) ?? 0;');
  });
});
