/**
 * Jira GRW-758 — the restaurant's Reports tabs, in order. A plain module, not the client component's: the server page reads
 * this list to pick the tab a link asked for, and a value exported from a 'use client' file is only a reference on the server.
 */
export type RestaurantTab = 'overview' | 'sales' | 'items' | 'inventory' | 'customers' | 'tips';
// Owner, 2026-11-26 — Guests third, right after the money, instead of second last.
export const RESTAURANT_TABS: readonly RestaurantTab[] = ['overview', 'sales', 'customers', 'items', 'inventory', 'tips'];
